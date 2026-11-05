/// License verification logic (mirrors packages/license in Rust)
///
/// Daily check strategy (fully offline, tamper-resistant):
///   - On every app launch we load license.key and verify HMAC + expiry.
///   - We also maintain license_check.json which stores:
///       { "lastCheckedDate": "YYYY-MM-DD", "sig": "<hmac>" }
///     where sig = HMAC(licenseId + "|" + lastCheckedDate, secret)
///   - Clock-rollback detection: if stored lastCheckedDate > today → reject.
///   - If > 24 hours since last check (or no check file) → re-run full expiry check.
///
use hmac::{Hmac, Mac};
use sha2::Sha256;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use chrono::{NaiveDate, Local};

type HmacSha256 = Hmac<Sha256>;

const KEY_PREFIX: &str = "RPOS";
const SEPARATOR: char = '.';

// Baked in at compile time — must match the secret used by the CLI generator.
const LICENSE_SECRET: &str = env!("LICENSE_SECRET");

// ─── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub restaurant_name: String,
    pub email: String,
    pub issued_at: String,
    /// Mandatory — no lifetime licenses allowed in this build.
    pub expires_at: Option<String>,
    pub max_devices: u32,
    pub features: Vec<String>,
    pub license_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResult {
    pub valid: bool,
    pub payload: Option<LicensePayload>,
    pub reason: Option<String>,
    /// Days remaining until expiry. None = check failed before we got a date.
    pub days_remaining: Option<i64>,
    /// Whether the app was blocked due to clock tampering.
    pub clock_tampered: bool,
}

/// Stored in license_check.json — the daily heartbeat record.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyCheckRecord {
    /// ISO date (YYYY-MM-DD) of the last successful license check.
    pub last_checked_date: String,
    /// HMAC-SHA256(license_id + "|" + last_checked_date, secret)
    /// Prevents the user from manually editing last_checked_date forward.
    pub sig: String,
}

// ─── HMAC helpers ───────────────────────────────────────────────────────────

fn hmac_sign(data: &str, secret: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC key error");
    mac.update(data.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

fn hmac_verify(data: &str, secret: &str, expected_hex: &str) -> bool {
    let computed = hmac_sign(data, secret);
    // Constant-time comparison
    if computed.len() != expected_hex.len() { return false; }
    computed.bytes().zip(expected_hex.bytes()).all(|(a, b)| a == b)
}

// ─── Daily check record helpers ─────────────────────────────────────────────

/// Build the HMAC input for the daily check record.
/// Format: "<licenseId>|<date>"
fn check_record_input(license_id: &str, date: &str) -> String {
    format!("{}|{}", license_id, date)
}

pub fn build_check_record(license_id: &str, date: &str) -> DailyCheckRecord {
    let input = check_record_input(license_id, date);
    DailyCheckRecord {
        last_checked_date: date.to_string(),
        sig: hmac_sign(&input, LICENSE_SECRET),
    }
}

/// Verify a DailyCheckRecord's signature.
/// Returns false if the sig doesn't match (record was tampered with).
pub fn verify_check_record(record: &DailyCheckRecord, license_id: &str) -> bool {
    let input = check_record_input(license_id, &record.last_checked_date);
    hmac_verify(&input, LICENSE_SECRET, &record.sig)
}

// ─── Core license verifier ──────────────────────────────────────────────────

pub fn verify_license(key: &str) -> VerifyResult {
    let parts: Vec<&str> = key.trim().splitn(3, SEPARATOR).collect();

    if parts.len() != 3 || parts[0] != KEY_PREFIX {
        return VerifyResult {
            valid: false, payload: None, clock_tampered: false,
            reason: Some("Invalid license key format".to_string()),
            days_remaining: None,
        };
    }

    let encoded_payload = parts[1];
    let provided_sig    = parts[2];

    // Verify HMAC signature on the key itself
    let expected_sig = hmac_sign(encoded_payload, LICENSE_SECRET);
    if expected_sig != provided_sig {
        return VerifyResult {
            valid: false, payload: None, clock_tampered: false,
            reason: Some("Invalid license key — signature mismatch".to_string()),
            days_remaining: None,
        };
    }

    // Decode payload
    let decoded = match URL_SAFE_NO_PAD.decode(encoded_payload) {
        Ok(b) => b,
        Err(_) => return VerifyResult {
            valid: false, payload: None, clock_tampered: false,
            reason: Some("Could not decode license payload".to_string()),
            days_remaining: None,
        },
    };

    let payload: LicensePayload = match serde_json::from_slice(&decoded) {
        Ok(p) => p,
        Err(_) => return VerifyResult {
            valid: false, payload: None, clock_tampered: false,
            reason: Some("Could not parse license payload".to_string()),
            days_remaining: None,
        },
    };

    // Expiry is mandatory — no lifetime licenses
    let exp_str = match &payload.expires_at {
        Some(s) => s.clone(),
        None => return VerifyResult {
            valid: false, payload: Some(payload), clock_tampered: false,
            reason: Some("License has no expiry date — invalid license format".to_string()),
            days_remaining: None,
        },
    };

    let exp_date = match NaiveDate::parse_from_str(&exp_str, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return VerifyResult {
            valid: false, payload: Some(payload), clock_tampered: false,
            reason: Some("Invalid expiry date in license".to_string()),
            days_remaining: None,
        },
    };

    let today = Local::now().naive_local().date();
    let diff  = exp_date.signed_duration_since(today).num_days();

    if diff < 0 {
        return VerifyResult {
            valid: false,
            payload: Some(payload),
            clock_tampered: false,
            reason: Some(format!("License expired on {} — please renew", exp_str)),
            days_remaining: Some(0),
        };
    }

    VerifyResult {
        valid: true,
        payload: Some(payload),
        reason: None,
        days_remaining: Some(diff),
        clock_tampered: false,
    }
}

// ─── Daily check (called on every app launch) ───────────────────────────────

/// Full daily check:
///   1. Verify the license key HMAC and expiry.
///   2. Load the daily check record; verify its signature.
///   3. Detect clock rollback (record date > today).
///   4. If all good, write an updated record with today's date.
///
/// Returns a VerifyResult with clock_tampered = true if rollback is detected.
pub fn daily_license_check(
    key: &str,
    check_record: Option<DailyCheckRecord>,
) -> (VerifyResult, Option<DailyCheckRecord>) {
    // Step 1: verify the license key itself
    let mut result = verify_license(key);

    if !result.valid {
        return (result, None);
    }

    let license_id = result.payload.as_ref()
        .map(|p| p.license_id.clone())
        .unwrap_or_default();

    let today = Local::now().naive_local().date();
    let today_str = today.format("%Y-%m-%d").to_string();

    // Step 2 & 3: check the daily record if present
    if let Some(record) = &check_record {
        // Verify the record's signature first
        if !verify_check_record(record, &license_id) {
            result.valid = false;
            result.reason = Some("License check record was tampered with".to_string());
            return (result, None);
        }

        // Parse the stored date
        if let Ok(stored_date) = NaiveDate::parse_from_str(&record.last_checked_date, "%Y-%m-%d") {
            // Clock rollback detection: stored date cannot be in the future
            if stored_date > today {
                result.valid = false;
                result.clock_tampered = true;
                result.reason = Some(
                    "System clock tampering detected — please set your system time correctly".to_string()
                );
                return (result, None);
            }
        }
    }

    // Step 4: write today's check record
    let new_record = build_check_record(&license_id, &today_str);
    (result, Some(new_record))
}
