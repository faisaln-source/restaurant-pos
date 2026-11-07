/**
 * Sidecar bundler — creates a portable API bundle for the Tauri sidecar.
 *
 * Output layout (inside apps/desktop/src-tauri/api-bundle/):
 *   node.exe           ← portable Node.js runtime
 *   dist/              ← compiled JS (from apps/api/dist/)
 *   node_modules/      ← runtime deps (incl. Prisma query engine .dll)
 *   prisma/            ← schema + migrations
 *   package.json
 *   app-config.json    ← template config (db url, secrets)
 *
 * The Tauri sidecar launcher (api-server-x86_64-pc-windows-msvc.exe)
 * reads app-config.json and spawns: node.exe dist/index.js
 *
 * Run from repo root: node apps/api/scripts/bundle-sidecar.js
 */

const fs   = require('fs');
const path = require('path');

const API_DIR    = path.resolve(__dirname, '..');
const BUNDLE_DIR = path.resolve(API_DIR, '../../apps/desktop/src-tauri/api-bundle');

console.log('📦 Building API sidecar bundle...\n');
console.log('  API dir   :', API_DIR);
console.log('  Bundle dir:', BUNDLE_DIR, '\n');

// Clean output
if (fs.existsSync(BUNDLE_DIR)) fs.rmSync(BUNDLE_DIR, { recursive: true });
fs.mkdirSync(BUNDLE_DIR, { recursive: true });

// 1. Compile API first (requires dist/ to exist)
const distDir = path.join(API_DIR, 'dist');
if (!fs.existsSync(distDir)) {
  console.error('❌ dist/ not found. Run "npm run build" in apps/api first.');
  process.exit(1);
}

// 2. Copy compiled dist/
console.log('  Copying dist/...');
copyDir(distDir, path.join(BUNDLE_DIR, 'dist'));

// 3. Copy production node_modules/
console.log('  Copying node_modules/ (this may take a while)...');
copyDir(path.join(API_DIR, 'node_modules'), path.join(BUNDLE_DIR, 'node_modules'));
// Remove .bin symlinks to avoid Windows packaging error (os error 5 Access is denied)
const binDir = path.join(BUNDLE_DIR, 'node_modules', '.bin');
if (fs.existsSync(binDir)) {
  fs.rmSync(binDir, { recursive: true, force: true });
}

// 4. Copy prisma schema + migrations (Prisma reads these at runtime)
console.log('  Copying prisma/...');
copyDir(path.join(API_DIR, 'prisma'), path.join(BUNDLE_DIR, 'prisma'));

// 5. Copy package.json (Prisma reads it for config)
fs.copyFileSync(path.join(API_DIR, 'package.json'), path.join(BUNDLE_DIR, 'package.json'));

// 6. Copy portable node.exe from the current Node installation
const nodeExe = process.execPath;
const nodeOut  = path.join(BUNDLE_DIR, 'node.exe');
console.log(`  Copying node.exe from ${nodeExe}...`);
fs.copyFileSync(nodeExe, nodeOut);

// 7. Write default app-config.json template
const configTemplate = {
  DATABASE_URL:    'postgresql://postgres:password@localhost:5432/restaurant_pos',
  JWT_SECRET:      'change-me-on-first-run',
  LICENSE_SECRET:  'restaurant-pos-master-secret-2026',
  PORT:            '4000',
  CORS_ORIGIN:     'tauri://localhost',
  NODE_ENV:        'production',
};
fs.writeFileSync(
  path.join(BUNDLE_DIR, 'app-config.json'),
  JSON.stringify(configTemplate, null, 2)
);

// Summary
console.log('\n✅  Sidecar bundle created at:', BUNDLE_DIR);
console.log('   Contents:');
for (const f of fs.readdirSync(BUNDLE_DIR)) {
  const stat = fs.statSync(path.join(BUNDLE_DIR, f));
  const size = stat.isDirectory() ? '(dir)' : `${(stat.size / 1024).toFixed(0)} KB`;
  console.log(`   ${f.padEnd(30)} ${size}`);
}

// Restore .gitkeep in dist/ so cargo check always finds the resource file
fs.writeFileSync(path.join(BUNDLE_DIR, 'dist', '.gitkeep'), '');

// ── helpers ──────────────────────────────────────────────────────────────────

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  ⚠️  Skipping missing dir: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src,  entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}
