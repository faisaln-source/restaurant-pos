/**
 * Download portable PostgreSQL 16 for Windows x64 and extract only the
 * files needed by the embedded database manager into:
 *   apps/desktop/src-tauri/pg-bundle/
 *
 * Usage:
 *   node apps/desktop/scripts/download-pg.js
 *
 * Requires network access. Run once before `tauri build`.
 * The pg-bundle/ directory is gitignored (too large to commit).
 */

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { execSync } = require('child_process');

const PG_VERSION = '16.4-1';
const PG_URL     = `https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-windows-x64-binaries.zip`;

const OUT_DIR  = path.resolve(__dirname, '../src-tauri/pg-bundle');
const TEMP_ZIP = path.join(os.tmpdir(), 'pg-portable.zip');
const TEMP_DIR = path.join(os.tmpdir(), 'pg-portable-extracted');

// Binaries to include (everything else is excluded to keep size down)
const REQUIRED_BINS = [
  'initdb.exe',
  'postgres.exe',
  'pg_ctl.exe',
  'psql.exe',
  'pg_dump.exe',
  'pg_resetwal.exe',
];

async function main() {
  console.log(`\n🐘 Downloading portable PostgreSQL ${PG_VERSION} for Windows x64...`);
  console.log(`   URL: ${PG_URL}\n`);

  // ── 1. Download ZIP ──────────────────────────────────────────────────────
  await download(PG_URL, TEMP_ZIP);
  const sizeMB = (fs.statSync(TEMP_ZIP).size / 1e6).toFixed(0);
  console.log(`✅ Downloaded ${sizeMB} MB to ${TEMP_ZIP}`);

  // ── 2. Extract via PowerShell (Windows built-in) ─────────────────────────
  console.log('\n📦 Extracting (this may take a minute)...');
  if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true });
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${TEMP_ZIP}' -DestinationPath '${TEMP_DIR}' -Force"`,
    { stdio: 'inherit' }
  );
  console.log('✅ Extracted');

  // ── 3. Copy required files ───────────────────────────────────────────────
  const pgSrc = path.join(TEMP_DIR, 'pgsql');
  if (!fs.existsSync(pgSrc)) {
    throw new Error(`Expected pgsql/ inside zip but not found at ${pgSrc}`);
  }

  if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'bin'),   { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'lib'),   { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'share'), { recursive: true });

  console.log('\n📋 Copying binaries...');
  for (const bin of REQUIRED_BINS) {
    const src = path.join(pgSrc, 'bin', bin);
    if (!fs.existsSync(src)) {
      console.warn(`  ⚠️  ${bin} not found — skipping`);
      continue;
    }
    fs.copyFileSync(src, path.join(OUT_DIR, 'bin', bin));
    console.log(`  ✓ bin/${bin}`);
  }

  console.log('\n📋 Copying lib/ (DLLs)...');
  copyDir(path.join(pgSrc, 'lib'), path.join(OUT_DIR, 'lib'));

  console.log('📋 Copying share/ (locale/encoding data)...');
  copyDir(path.join(pgSrc, 'share'), path.join(OUT_DIR, 'share'));

  // ── 4. Clean up temp files ───────────────────────────────────────────────
  console.log('\n🧹 Cleaning up temp files...');
  fs.rmSync(TEMP_ZIP, { force: true });
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });

  // ── 5. Summary ───────────────────────────────────────────────────────────
  const totalMB = getDirSizeMB(OUT_DIR);
  console.log(`\n✅ pg-bundle ready at: ${OUT_DIR}`);
  console.log(`   Total size: ${totalMB} MB`);
  console.log('\n   Contents:');
  for (const f of fs.readdirSync(OUT_DIR)) {
    const p = path.join(OUT_DIR, f);
    const stat = fs.statSync(p);
    const size = stat.isDirectory()
      ? `${getDirSizeMB(p)} MB`
      : `${(stat.size / 1e6).toFixed(1)} MB`;
    console.log(`   ${f.padEnd(10)} ${size}`);
  }
  console.log('\n🎉 Done! You can now run: npx tauri build\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let downloaded = 0;
    let total = 0;
    let lastPct = -1;

    function request(u) {
      const proto = u.startsWith('https') ? https : http;
      proto.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        total = parseInt(res.headers['content-length'] || '0', 10);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
              process.stdout.write(`\r   Progress: ${pct}%  (${(downloaded/1e6).toFixed(0)} / ${(total/1e6).toFixed(0)} MB)`);
              lastPct = pct;
            }
          }
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); console.log(); resolve(); });
      }).on('error', reject);
    }

    request(url);
  });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  ⚠️  Source dir not found: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src,  entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

function getDirSizeMB(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory()
      ? getDirSizeMB(p) * 1e6
      : fs.statSync(p).size;
  }
  return (total / 1e6).toFixed(0);
}

main().catch((e) => { console.error('\n❌ Error:', e.message); process.exit(1); });

