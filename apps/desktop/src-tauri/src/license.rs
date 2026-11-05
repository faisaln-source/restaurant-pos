/// License verification logic (mirrors packages/license in Rust)
use hmac::{Hmac, Mac};
use sha2::Sha256;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use chrono::{NaiveDate, Local};

type HmacSha256 = Hmac<Sha256>;

const KEY_PREFIX: &str = "RPOS";
const SEPARATOR: char = '.';

// Keep this in sync with your LICENSE_SECRET env var used in key generation
// In production build, bake this in at compile time via build.rs + env
const LICENSE_SECRET: &str = env!("LICENSE_SECRET");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub restaurant_name: String,
    pub email: String,
    pub issued_at: String,
    pub expires_at: Option<String>,
    pub max_devices: u32,
    pub features: Vec<String>,
    pub license_id: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyResult {
    pub valid: bool,
    pub payload: Option<LicensePayload>,
    pub reason: Option<String>,
    pub days_remaining: Option<i64>,
}

fn hmac_sign(data: &str, secret: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC key error");
    mac.update(data.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

pub fn verify_license(key: &str) -> VerifyResult {
    let parts: Vec<&str> = key.trim().splitn(3, SEPARATOR).collect();

    if parts.len() != 3 || parts[0] != KEY_PREFIX {
        return VerifyResult {
            valid: false,
            payload: None,
            reason: Some("Invalid license key format".to_string()),
            days_remaining: None,
        };
    }

    let encoded_payload = parts[1];
    let provided_sig = parts[2];

    // Verify HMAC signature
    let expected_sig = hmac_sign(encoded_payload, LICENSE_SECRET);
    if expected_sig != provided_sig {
        return VerifyResult {
            valid: false,
            payload: None,
            reason: Some("Invalid license key — signature mismatch".to_string()),
            days_remaining: None,
        };
    }

    // Decode payload
    let decoded = match URL_SAFE_NO_PAD.decode(encoded_payload) {
        Ok(b) => b,
        Err(_) => return VerifyResult {
            valid: false,
            payload: None,
            reason: Some("Could not decode license payload".to_string()),
            days_remaining: None,
        },
    };

    let payload: LicensePayload = match serde_json::from_slice(&decoded) {
        Ok(p) => p,
        Err(_) => return VerifyResult {
            valid: false,
            payload: None,
            reason: Some("Could not parse license payload".to_string()),
            days_remaining: None,
        },
    };

    // Check expiry
    let days_remaining = if let Some(ref exp_str) = payload.expires_at {
        match NaiveDate::parse_from_str(exp_str, "%Y-%m-%d") {
            Ok(exp_date) => {
                let today = Local::now().naive_local().date();
                let diff = exp_date.signed_duration_since(today).num_days();
                if diff < 0 {
                    return VerifyResult {
                        valid: false,
                        payload: Some(payload),
                        reason: Some(format!("License expired on {}", exp_str)),
                        days_remaining: Some(0),
                    };
                }
                Some(diff)
            }
            Err(_) => return VerifyResult {
                valid: false,
                payload: None,
                reason: Some("Invalid expiry date in license".to_string()),
                days_remaining: None,
            },
        }
    } else {
        None // lifetime
    };

    VerifyResult {
        valid: true,
        payload: Some(payload),
        reason: None,
        days_remaining,
    }
}

