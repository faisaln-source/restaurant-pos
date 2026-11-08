use tauri::AppHandle;
use tauri::Manager;
use std::path::PathBuf;
use crate::license::{
    verify_license, daily_license_check, build_check_record,
    DailyCheckRecord, VerifyResult,
};

const LICENSE_FILE:       &str = "license.key";
const DAILY_CHECK_FILE:   &str = "license_check.json";

// ─── Path helpers ────────────────────────────────────────────────────────────

fn app_data_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir()
        .expect("Could not resolve app data directory")
}

fn license_path(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join(LICENSE_FILE)
}

fn check_record_path(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join(DAILY_CHECK_FILE)
}

fn ensure_app_dir(app: &AppHandle) -> Result<(), String> {
    std::fs::create_dir_all(app_data_dir(app))
        .map_err(|e| format!("Could not create app data directory: {}", e))
}

// ─── Internal helpers ────────────────────────────────────────────────────────

fn read_key(app: &AppHandle) -> Option<String> {
    std::fs::read_to_string(license_path(app))
        .ok()
        .map(|s| s.trim().to_string())
}

fn read_check_record(app: &AppHandle) -> Option<DailyCheckRecord> {
    let raw = std::fs::read_to_string(check_record_path(app)).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_check_record(app: &AppHandle, record: &DailyCheckRecord) {
    if let Ok(json) = serde_json::to_string_pretty(record) {
        let _ = std::fs::write(check_record_path(app), json);
    }
}

// ─── Tauri commands ──────────────────────────────────────────────────────────

/// Called on every app startup.
/// Runs the full daily license check including clock-tamper detection.
/// Writes an updated check record if the check passes.
#[tauri::command]
pub fn get_license_info(app: AppHandle) -> VerifyResult {
    let key = match read_key(&app) {
        Some(k) => k,
        None => return VerifyResult {
            valid: false,
            payload: None,
            clock_tampered: false,
            reason: Some("No license file found. Please activate your license.".to_string()),
            days_remaining: None,
        },
    };

    let existing_record = read_check_record(&app);
    let (result, new_record) = daily_license_check(&key, existing_record);

    // Persist the updated check record whenever the check passes
    if result.valid {
        if let Some(record) = new_record {
            let _ = ensure_app_dir(&app);
            write_check_record(&app, &record);
        }
    }

    result
}

/// Verify a key string without saving it (used for preview in the UI).
#[tauri::command]
pub fn verify_license_key(key: String) -> VerifyResult {
    verify_license(&key)
}

/// Verify a key, save it to disk, and write an initial daily-check record.
#[tauri::command]
pub fn save_license_key(app: AppHandle, key: String) -> Result<VerifyResult, String> {
    let result = verify_license(key.trim());
    if !result.valid {
        return Ok(result);
    }

    ensure_app_dir(&app)?;

    // Save the license key
    std::fs::write(license_path(&app), key.trim())
        .map_err(|e| format!("Could not save license file: {}", e))?;

    // Write an initial daily-check record for today
    let license_id = result.payload.as_ref()
        .map(|p| p.license_id.as_str())
        .unwrap_or("");
    let today = chrono::Local::now().naive_local().date()
        .format("%Y-%m-%d").to_string();
    let record = build_check_record(license_id, &today);
    write_check_record(&app, &record);

    Ok(result)
}

/// Return the app data directory path (useful for support/diagnostics).
#[tauri::command]
pub fn get_app_data_dir(app: AppHandle) -> String {
    app_data_dir(&app).to_string_lossy().to_string()
}

/// Open an external URL in the default browser or OS handler (e.g. WhatsApp, web links).
#[tauri::command]
pub fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    eprintln!("[tauri] Opening external URL: {url}");

    #[cfg(target_os = "windows")]
    {
        // On Windows, rundll32 invokes ShellExecute directly, avoiding cmd argument escaping issues
        if let Ok(_) = std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
        {
            return Ok(());
        }
    }

    use tauri_plugin_shell::ShellExt;
    if let Err(e) = app.shell().open(&url, None) {
        eprintln!("[tauri] shell.open fallback failed: {e}");
    }
    Ok(())
}

/// Explicitly shutdown and exit the application after user confirms.
#[tauri::command]
pub fn exit_app(app: AppHandle) {
    eprintln!("[tauri] User confirmed exit — shutting down cleanly");

    // 1. Kill API sidecar child process
    let state = app.state::<crate::ApiProcess>();
    let child = state.0.lock().ok().and_then(|mut g| g.take());
    if let Some(c) = child {
        eprintln!("[tauri] Killing API sidecar process");
        let _ = c.kill();
    }

    // 2. Stop embedded PostgreSQL cleanly so postmaster.pid is removed
    if let (Ok(res), Ok(data)) = (
        app.path().resource_dir(),
        app.path().app_data_dir(),
    ) {
        let pg = crate::postgres::PostgresManager::new(&res, &data);
        if pg.is_running() {
            eprintln!("[tauri] Stopping embedded PostgreSQL");
            pg.stop();
        }
    }

    // 3. Exit process
    app.exit(0);
}
