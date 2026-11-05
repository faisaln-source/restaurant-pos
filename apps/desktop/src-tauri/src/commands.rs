use tauri::AppHandle;
use tauri_plugin_fs::FsExt;
use std::path::PathBuf;
use crate::license::{verify_license, VerifyResult};

const LICENSE_FILE: &str = "license.key";

fn license_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir()
        .expect("Could not get app data dir")
        .join(LICENSE_FILE)
}

/// Tauri command: verify a license key string (does not save it)
#[tauri::command]
pub fn verify_license_key(key: String) -> VerifyResult {
    verify_license(&key)
}

/// Tauri command: verify and save a license key to disk
#[tauri::command]
pub fn save_license_key(app: AppHandle, key: String) -> Result<VerifyResult, String> {
    let result = verify_license(&key);
    if !result.valid {
        return Ok(result);
    }

    let path = license_path(&app);

    // Ensure app data directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create app data dir: {}", e))?;
    }

    std::fs::write(&path, key.trim())
        .map_err(|e| format!("Could not save license: {}", e))?;

    Ok(result)
}

/// Tauri command: read and verify the saved license key
#[tauri::command]
pub fn get_license_info(app: AppHandle) -> VerifyResult {
    let path = license_path(&app);

    match std::fs::read_to_string(&path) {
        Ok(key) => verify_license(key.trim()),
        Err(_) => crate::license::VerifyResult {
            valid: false,
            payload: None,
            reason: Some("No license file found. Please activate your license.".to_string()),
            days_remaining: None,
        },
    }
}

/// Tauri command: return the app data directory path
#[tauri::command]
pub fn get_app_data_dir(app: AppHandle) -> String {
    app.path().app_data_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

