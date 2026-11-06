use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

mod license;
mod commands;

/// Global handle to the spawned API sidecar process.
/// We store the child so we can kill it when the app exits.
struct ApiProcess(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

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
            // ── Spawn API sidecar ──────────────────────────────────────────
            match app.shell().sidecar("api-server") {
                Ok(sidecar_cmd) => {
                    match sidecar_cmd.spawn() {
                        Ok((_rx, child)) => {
                            eprintln!("[tauri] API sidecar started");
                            let state = app.state::<ApiProcess>();
                            *state.0.lock().unwrap() = Some(child);
                        }
                        Err(e) => {
                            eprintln!("[tauri] WARNING: failed to spawn API sidecar: {}", e);
                            // Don't hard-fail — user may be running API separately
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[tauri] WARNING: api-server sidecar not configured: {}", e);
                }
            }

            // ── Open devtools in debug builds ──────────────────────────────
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill API sidecar when the last window closes
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                let open_windows = app.webview_windows();
                if open_windows.is_empty() {
                    let state = app.state::<ApiProcess>();
                    let child_opt = state.0.lock().ok().and_then(|mut g| g.take());
                    if let Some(child) = child_opt {
                        eprintln!("[tauri] Killing API sidecar");
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running restaurant pos");
}
