// api-server launcher: spawns node.exe + bundled API in the same directory.
// This binary is used as a Tauri sidecar ("externalBin": ["binaries/api-server"]).
//
// At runtime it lives next to a folder called "api-bundle/" containing:
//   api-bundle/node.exe         – portable Node.js runtime
//   api-bundle/dist/index.js    – compiled Express API
//   api-bundle/node_modules/    – runtime deps (incl. Prisma query engine)
//   api-bundle/prisma/          – schema + migrations
//   api-bundle/app-config.json  – db url + secrets (key=value or simple JSON)
//
// Config is passed to Node as environment variables.
// No external Rust crates are used so this compiles offline.

use std::{
    env,
    fs,
    path::PathBuf,
    process::{self, Command, Stdio},
};

fn exe_dir() -> PathBuf {
    env::current_exe()
        .expect("cannot locate own executable")
        .parent()
        .expect("executable has no parent directory")
        .to_path_buf()
}

/// Minimal JSON object parser — handles flat {"key":"value"} only.
/// Returns Vec<(key, value)>. Skips non-string values.
fn parse_flat_json(src: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    // Strip outer braces
    let inner = src.trim().trim_start_matches('{').trim_end_matches('}');
    // Split on commas that are outside quotes (naive but sufficient for flat config)
    let mut depth = 0usize;
    let mut in_str = false;
    let mut escape_next = false;
    let mut segment_start = 0;
    let chars: Vec<char> = inner.chars().collect();
    let mut segments: Vec<String> = Vec::new();

    for (i, &c) in chars.iter().enumerate() {
        if escape_next { escape_next = false; continue; }
        if c == '\\' && in_str { escape_next = true; continue; }
        if c == '"' { in_str = !in_str; continue; }
        if in_str { continue; }
        match c {
            '{' | '[' => depth += 1,
            '}' | ']' => { if depth > 0 { depth -= 1; } }
            ',' if depth == 0 => {
                segments.push(chars[segment_start..i].iter().collect());
                segment_start = i + 1;
            }
            _ => {}
        }
    }
    segments.push(chars[segment_start..].iter().collect());

    for seg in segments {
        let seg = seg.trim();
        // Expect "key": "value"
        let parts: Vec<&str> = seg.splitn(2, ':').collect();
        if parts.len() != 2 { continue; }
        let key = parts[0].trim().trim_matches('"');
        let val_raw = parts[1].trim();
        if !val_raw.starts_with('"') { continue; } // skip non-string values
        let val = val_raw.trim_matches('"');
        if !key.is_empty() && !val.is_empty() {
            pairs.push((key.to_uppercase(), val.to_string()));
        }
    }
    pairs
}

fn main() {
    let dir = exe_dir();
    let bundle = dir.join("api-bundle");
    let node_exe = bundle.join("node.exe");
    let entry = bundle.join("dist").join("index.js");

    // Validate required paths
    if !node_exe.exists() {
        eprintln!("[api-launcher] ERROR: node.exe not found at {}", node_exe.display());
        process::exit(1);
    }
    if !entry.exists() {
        eprintln!("[api-launcher] ERROR: dist/index.js not found at {}", entry.display());
        process::exit(1);
    }

    eprintln!("[api-launcher] Starting API → node {}", entry.display());

    // Load app-config.json and inject as env vars
    let mut config_env: Vec<(String, String)> = Vec::new();
    let config_path = bundle.join("app-config.json");
    if config_path.exists() {
        match fs::read_to_string(&config_path) {
            Ok(raw) => {
                config_env = parse_flat_json(&raw);
                eprintln!("[api-launcher] Loaded {} config keys from app-config.json", config_env.len());
            }
            Err(e) => eprintln!("[api-launcher] WARN: could not read app-config.json: {}", e),
        }
    } else {
        eprintln!("[api-launcher] WARN: app-config.json not found — using inherited env");
    }

    let nm = bundle.join("node_modules");

    let mut cmd = Command::new(&node_exe);
    cmd.arg(&entry)
        .current_dir(&bundle)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .env("NODE_PATH", nm.to_string_lossy().as_ref());

    // Inject config env vars — do not overwrite values already injected by Tauri (e.g. DATABASE_URL)
    for (k, v) in &config_env {
        if env::var(k).is_ok() {
            continue;
        }
        cmd.env(k, v);
    }

    // Explicitly forward DATABASE_URL if injected by Tauri
    if let Ok(db) = env::var("DATABASE_URL") {
        cmd.env("DATABASE_URL", db);
    }

    let mut child = cmd.spawn().unwrap_or_else(|e| {
        eprintln!("[api-launcher] Failed to spawn node.exe: {}", e);
        process::exit(1);
    });

    eprintln!("[api-launcher] API process started (pid {})", child.id());

    let status = child.wait().unwrap_or_else(|e| {
        eprintln!("[api-launcher] wait error: {}", e);
        process::exit(1);
    });

    eprintln!("[api-launcher] API exited: {}", status);
    process::exit(status.code().unwrap_or(1));
}
