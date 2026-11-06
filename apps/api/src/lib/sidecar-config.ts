/**
 * Sidecar config loader — reads app-config.json from the directory
 * next to the executable when running as a bundled Tauri sidecar.
 * Falls back to environment variables / dotenv for normal dev mode.
 */

import path from 'path';
import fs from 'fs';

interface AppConfig {
  DATABASE_URL?: string;
  JWT_SECRET?: string;
  PORT?: string;
  CORS_ORIGIN?: string;
}

export function loadSidecarConfig(): void {
  // When packaged by pkg, __dirname points to the snapshot; use process.execPath instead
  const exeDir = path.dirname(process.execPath);
  const configPath = path.join(exeDir, 'app-config.json');

  if (!fs.existsSync(configPath)) return; // not running as sidecar — use dotenv / env vars

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config: AppConfig = JSON.parse(raw);

    for (const [key, value] of Object.entries(config)) {
      if (value && !process.env[key]) {
        process.env[key] = value;
      }
    }
    console.log('[sidecar] Loaded config from', configPath);
  } catch (err) {
    console.warn('[sidecar] Could not load app-config.json:', (err as Error).message);
  }
}

