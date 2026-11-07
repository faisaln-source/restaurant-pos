//! Embedded PostgreSQL manager for Restaurant POS.
//!
//! Manages a portable PostgreSQL 16 instance bundled with the app.
//! Binaries live in `resources/pg-bundle/`.
//! Data is stored in `AppData/Restaurant POS/pgdata/` (survives updates).

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Port for the embedded PostgreSQL instance (5433 avoids clash with any
/// existing system PostgreSQL on the default 5432).
pub const PG_PORT: u16 = 5433;
pub const PG_USER: &str = "pos_admin";
pub const PG_DATABASE: &str = "restaurant_pos";

/// Internal password for the embedded DB — not exposed to end users.
/// Change this string to rotate credentials in future builds.
const PG_PASSWORD: &str = "POS_internal_db_2026!";

/// Strips Windows verbatim prefix (`\\?\` or `\\?\UNC\`) so C runtimes
/// (like PostgreSQL and its sub-processes) don't choke when converting `\` to `/`.
pub fn sanitize_path(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy().to_string();
    if let Some(stripped) = s.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{}", stripped))
    } else if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path
    }
}

pub struct PostgresManager {
    pub bin_dir:  PathBuf,  // <resources>/pg-bundle/bin/
    pub data_dir: PathBuf,  // <AppData>/Restaurant POS/pgdata/
}

impl PostgresManager {
    pub fn new(resource_dir: &Path, app_data_dir: &Path) -> Self {
        let clean_res = sanitize_path(resource_dir.to_path_buf());
        let clean_data = sanitize_path(app_data_dir.to_path_buf());
        Self {
            bin_dir:  clean_res.join("pg-bundle").join("bin"),
            data_dir: clean_data.join("pgdata"),
        }
    }

    /// Returns the DATABASE_URL connection string for Prisma / API.
    pub fn connection_string(&self) -> String {
        format!(
            "postgresql://{}:{}@127.0.0.1:{}/{}",
            PG_USER, PG_PASSWORD, PG_PORT, PG_DATABASE
        )
    }

    /// True if the data directory has already been initialized.
    pub fn is_initialized(&self) -> bool {
        self.data_dir.join("PG_VERSION").exists()
    }

    /// Build a Command for a pg binary, with `bin_dir` prepended to PATH
    /// so Windows can find icuuc67.dll and all other bundled DLLs,
    /// and with PGSHAREDIR / PGDATA env vars pointing to our bundled share/.
    fn pg_cmd(&self, exe: &str) -> Command {
        let bin = self.bin_dir.join(exe);
        let mut cmd = Command::new(&bin);

        // Crucial: set working directory to bin_dir so Windows finds DLLs in current dir
        cmd.current_dir(&self.bin_dir);

        // Prepend our bin_dir to PATH so Windows DLL search finds all bundled DLLs
        let bin_dir_str = self.bin_dir.to_string_lossy().to_string();
        let current_path = env::var("PATH").unwrap_or_default();
        let new_path = if current_path.is_empty() {
            bin_dir_str.clone()
        } else {
            format!("{};{}", bin_dir_str, current_path)
        };
        cmd.env("PATH", new_path);

        // Tell PostgreSQL binaries where our bundled share/ directory is.
        // Without this, initdb/postgres look for share/ relative to a compiled-in
        // prefix that doesn't exist in a portable install.
        let share_dir = self.bin_dir.parent()
            .unwrap_or(&self.bin_dir)
            .join("share");
        cmd.env("PGSHAREDIR", share_dir.to_string_lossy().as_ref());

        // Also set PGLIB so postgres can find lib/ (timezone data etc.)
        let lib_dir = self.bin_dir.parent()
            .unwrap_or(&self.bin_dir)
            .join("lib");
        cmd.env("PGLIB", lib_dir.to_string_lossy().as_ref());

        cmd
    }

    /// True if the server process is currently running.
    pub fn is_running(&self) -> bool {
        self.pg_cmd("pg_ctl.exe")
            .args(["status", "-D", &self.data_dir.to_string_lossy()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    // ── Cluster lifecycle ───────────────────────────────────────────────────

    /// Initialize a fresh database cluster (runs `initdb`).
    /// Must only be called once; subsequent calls will fail.
    pub fn init_cluster(&self) -> Result<(), String> {
        eprintln!("[pg] Initialising cluster at {}", self.data_dir.display());

        // If a previous failed init left an empty/corrupt pgdata dir, remove it.
        // initdb cannot chmod a pre-existing directory on Windows → "Permission denied".
        if self.data_dir.exists() && !self.data_dir.join("PG_VERSION").exists() {
            eprintln!("[pg] Removing incomplete pgdata dir for fresh init");
            fs::remove_dir_all(&self.data_dir)
                .map_err(|e| format!("Cannot remove stale pgdata dir: {e}"))?;
        }

        // Let initdb create the directory itself (it sets correct permissions).

        // Ensure the parent dir exists so we can write the temp password file
        if let Some(parent) = self.data_dir.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Cannot create app-data parent dir: {e}"))?;
        }

        // initdb reads the initial superuser password from a temp file.
        // Use %TEMP% (always writable) instead of pgdata parent.
        let pw_file = std::env::temp_dir().join("pos_pg_init_pw.tmp");
        fs::write(&pw_file, PG_PASSWORD)
            .map_err(|e| format!("Cannot write temp password file: {e}"))?;

        let result = self.pg_cmd("initdb.exe")
            .args([
                "-D",        &self.data_dir.to_string_lossy(),
                "-U",        PG_USER,
                "-A",        "md5",
                "--pwfile",  &pw_file.to_string_lossy(),
                "-E",        "UTF8",
                "--locale",  "C",
                "--lc-messages", "C",
                "--no-sync",   // skip fsync — dramatically faster on Windows
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to run initdb: {e}"));

        let _ = fs::remove_file(&pw_file); // always clean up

        let output = result?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(format!(
                "initdb failed (code {:?}):\nSTDERR: {}\nSTDOUT: {}",
                output.status.code(), stderr, stdout
            ));
        }

        // Patch postgresql.conf with our custom settings
        self.patch_postgresql_conf()?;

        eprintln!("[pg] Cluster initialised OK");
        Ok(())
    }

    fn patch_postgresql_conf(&self) -> Result<(), String> {
        let conf = self.data_dir.join("postgresql.conf");
        let addition = format!(
            "\n# ── Restaurant POS embedded PostgreSQL ──\n\
             port                = {PG_PORT}\n\
             listen_addresses    = '127.0.0.1'\n\
             max_connections     = 20\n\
             shared_buffers      = 32MB\n\
             logging_collector   = off\n\
             log_min_messages    = error\n\
             fsync               = off\n\
             synchronous_commit  = off\n"
        );
        let mut text = fs::read_to_string(&conf)
            .unwrap_or_default();
        text.push_str(&addition);
        fs::write(&conf, text)
            .map_err(|e| format!("Cannot write postgresql.conf: {e}"))?;
        Ok(())
    }

    /// Start PostgreSQL; blocks until the server reports ready (≤ 30 s).
    pub fn start(&self) -> Result<(), String> {
        eprintln!("[pg] Starting PostgreSQL on port {PG_PORT}");

        // If already running just return early
        if self.is_running() {
            eprintln!("[pg] Already running — skipping start");
            return Ok(());
        }

        // Clean up stale postmaster.pid if postgres crashed or was forcefully closed previously
        let pid_file = self.data_dir.join("postmaster.pid");
        if pid_file.exists() && !self.is_running() {
            eprintln!("[pg] Removing stale postmaster.pid from previous run");
            let _ = fs::remove_file(&pid_file);
        }

        let log     = self.data_dir.parent()
            .unwrap_or(&self.data_dir)
            .join("postgres.log");

        let status = self.pg_cmd("pg_ctl.exe")
            .args([
                "start",
                "-D",  &self.data_dir.to_string_lossy(),
                "-l",  &log.to_string_lossy(),
                "-w",         // wait until ready
                "-t", "30",   // timeout seconds
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("pg_ctl start failed: {e}"))?;

        if !status.success() && !self.is_running() {
            return Err(format!("PostgreSQL failed to start (code {:?}). Check {}",
                status.code(), log.display()));
        }

        eprintln!("[pg] PostgreSQL ready ✓");
        Ok(())
    }

    /// Gracefully stop the PostgreSQL server.
    pub fn stop(&self) {
        eprintln!("[pg] Stopping PostgreSQL");
        let _ = self.pg_cmd("pg_ctl.exe")
            .args([
                "stop",
                "-D", &self.data_dir.to_string_lossy(),
                "-m", "fast",
                "-w",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    // ── Database ────────────────────────────────────────────────────────────

    /// Create the `restaurant_pos` database if it does not already exist.
    pub fn ensure_database(&self) -> Result<(), String> {
        let port = PG_PORT.to_string();

        // Check whether the database exists
        let out = self.pg_cmd("psql.exe")
            .args(["-h", "127.0.0.1", "-p", &port,
                   "-U", PG_USER, "-d", "postgres",
                   "-tAc",
                   &format!("SELECT 1 FROM pg_database WHERE datname='{PG_DATABASE}'")])
            .env("PGPASSWORD", PG_PASSWORD)
            .output()
            .map_err(|e| format!("psql query failed: {e}"))?;

        if String::from_utf8_lossy(&out.stdout).trim() == "1" {
            eprintln!("[pg] Database '{PG_DATABASE}' already exists");
            return Ok(());
        }

        eprintln!("[pg] Creating database '{PG_DATABASE}'");
        let status = self.pg_cmd("psql.exe")
            .args(["-h", "127.0.0.1", "-p", &port,
                   "-U", PG_USER, "-d", "postgres",
                   "-c", &format!(
                       "CREATE DATABASE {PG_DATABASE} \
                        ENCODING 'UTF8' \
                        LC_COLLATE 'C' LC_CTYPE 'C' \
                        TEMPLATE template0"
                   )])
            .env("PGPASSWORD", PG_PASSWORD)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("CREATE DATABASE failed: {e}"))?;

        if !status.success() {
            return Err(format!("Failed to create database '{PG_DATABASE}'"));
        }
        eprintln!("[pg] Database created ✓");
        Ok(())
    }
}

