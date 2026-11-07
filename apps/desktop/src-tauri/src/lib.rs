use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::ShellExt;

mod license;
mod commands;
mod postgres;

/// Holds the spawned API sidecar so we can kill it on exit.
struct ApiProcess(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

// ── Setup phases emitted to the React frontend ────────────────────────────
// The web app listens for "setup:progress" and "setup:done" / "setup:error".
#[derive(Clone, serde::Serialize)]
struct SetupProgress {
    phase:   &'static str,
    message: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(ApiProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::verify_license_key,
            commands::save_license_key,
            commands::get_license_info,
            commands::get_app_data_dir,
        ])
        .setup(|app| {
            // ── Open devtools in debug builds ──────────────────────────────
            #[cfg(debug_assertions)]
            {
                if let Some(w) = app.get_webview_window("main") {
                    w.open_devtools();
                }
            }

            let handle = app.handle().clone();

            // ── Acquire resource + app-data paths ─────────────────────────
            let raw_resource_dir = app.path().resource_dir()
                .unwrap_or_else(|_| std::env::current_exe()
                    .unwrap()
                    .parent()
                    .unwrap()
                    .to_path_buf());

            let raw_app_data_dir = app.path().app_data_dir()
                .unwrap_or_else(|_| {
                    let home = std::env::var("APPDATA")
                        .unwrap_or_else(|_| ".".to_string());
                    std::path::PathBuf::from(home).join("Restaurant POS")
                });

            let resource_dir = postgres::sanitize_path(raw_resource_dir);
            let app_data_dir = postgres::sanitize_path(raw_app_data_dir);

            eprintln!("[tauri] resource_dir : {}", resource_dir.display());
            eprintln!("[tauri] app_data_dir : {}", app_data_dir.display());

            // ── Background thread: start postgres then API ─────────────────
            std::thread::spawn(move || {
                // Give the webview a brief moment (1000ms) to mount and attach event listeners
                std::thread::sleep(std::time::Duration::from_millis(1000));

                let emit = |phase: &'static str, msg: &str| {
                    let _ = handle.emit("setup:progress", SetupProgress {
                        phase,
                        message: msg.to_string(),
                    });
                    eprintln!("[setup:{phase}] {msg}");
                };

                // ── 1. PostgreSQL ──────────────────────────────────────────
                let pg_bundle_dir = resource_dir.join("pg-bundle");

                if pg_bundle_dir.join("bin").join("postgres.exe").exists() {
                    // Bundled PostgreSQL is present — use it
                    let pg = postgres::PostgresManager::new(&resource_dir, &app_data_dir);

                    if !pg.is_initialized() {
                        emit("pg_init", "Initialising embedded database (first run)…");
                        if let Err(e) = pg.init_cluster() {
                            let _ = handle.emit("setup:error",
                                format!("Database init failed: {e}"));
                            return;
                        }
                    }

                    emit("pg_start", "Starting embedded database…");
                    if let Err(e) = pg.start() {
                        let _ = handle.emit("setup:error",
                            format!("Database start failed: {e}"));
                        return;
                    }

                    emit("pg_db", "Preparing restaurant database…");
                    if let Err(e) = pg.ensure_database() {
                        let _ = handle.emit("setup:error",
                            format!("Database creation failed: {e}"));
                        return;
                    }

                    // Store connection string so we can pass it to the sidecar
                    let db_url = pg.connection_string();

                    // ── 2. Run Prisma migrations ───────────────────────────
                    emit("migrate", "Applying database migrations…");
                    let api_bundle = resource_dir.join("api-bundle");
                    let node_exe   = api_bundle.join("node.exe");
                    let prisma_bin = api_bundle.join("node_modules")
                        .join("prisma").join("bin.js");

                    if node_exe.exists() && prisma_bin.exists() {
                        let status = std::process::Command::new(&node_exe)
                            .arg(&prisma_bin)
                            .arg("migrate")
                            .arg("deploy")
                            .current_dir(&api_bundle)
                            .env("DATABASE_URL", &db_url)
                            .stdout(std::process::Stdio::null())
                            .stderr(std::process::Stdio::null())
                            .status();

                        match status {
                            Ok(s) if s.success() => {
                                eprintln!("[setup:migrate] Migrations applied OK");
                            }
                            Ok(s) => {
                                eprintln!("[setup:migrate] WARN: prisma migrate exited {:?}", s.code());
                            }
                            Err(e) => {
                                eprintln!("[setup:migrate] WARN: could not run prisma: {e}");
                            }
                        }
                    }

                    // ── 3. Start API sidecar with injected DB config ───────
                    emit("api", "Starting API server…");
                    start_api_sidecar(&handle, Some(db_url));

                } else {
                    // No bundled PostgreSQL — API connects to external PG via app-config.json
                    eprintln!("[setup] No pg-bundle found; using external database from app-config.json");
                    emit("api", "Starting API server…");
                    start_api_sidecar(&handle, None);
                }

                // Signal React that setup is complete
                let _ = handle.emit("setup:done", ());
                eprintln!("[setup] Ready");
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                if app.webview_windows().is_empty() {
                    // Kill API sidecar
                    let state = app.state::<ApiProcess>();
                    let child = state.0.lock().ok().and_then(|mut g| g.take());
                    if let Some(c) = child {
                        eprintln!("[tauri] Killing API sidecar");
                        let _ = c.kill();
                    }

                    // Stop embedded PostgreSQL if it was started
                    // We re-create the manager from known paths to call stop()
                    // (best-effort: if paths are unavailable, postgres auto-exits anyway)
                    if let (Ok(res), Ok(data)) = (
                        app.path().resource_dir(),
                        app.path().app_data_dir(),
                    ) {
                        let pg = postgres::PostgresManager::new(&res, &data);
                        if pg.is_running() {
                            pg.stop();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running restaurant pos");
}

// ── Helpers ───────────────────────────────────────────────────────────────

fn start_api_sidecar(
    handle: &tauri::AppHandle,
    db_url: Option<String>,
) {
    match handle.shell().sidecar("api-server") {
        Ok(mut cmd) => {
            if let Some(url) = db_url {
                cmd = cmd.env("DATABASE_URL", url);
            }
            match cmd.spawn() {
                Ok((_rx, child)) => {
                    eprintln!("[tauri] API sidecar started");
                    let state = handle.state::<ApiProcess>();
                    *state.0.lock().unwrap() = Some(child);
                }
                Err(e) => {
                    eprintln!("[tauri] WARNING: failed to spawn API sidecar: {e}");
                }
            }
        }
        Err(e) => {
            eprintln!("[tauri] WARNING: api-server sidecar not found: {e}");
        }
    }
}
