/**
 * Tauri bridge — type-safe wrappers around Tauri commands and events.
 * Gracefully returns null when running in a browser (non-Tauri) context.
 */

// ─── Environment detection ───────────────────────────────────────────────────

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LicensePayload {
  restaurantName: string;
  email: string;
  issuedAt: string;
  /** Always set — no lifetime licenses. */
  expiresAt: string;
  maxDevices: number;
  features: string[];
  licenseId: string;
}

export interface LicenseVerifyResult {
  valid: boolean;
  payload?: LicensePayload;
  reason?: string;
  /** Days until expiry. null = unknown / check failed before expiry was read. */
  daysRemaining?: number | null;
  /** True when system clock was rolled back to avoid expiry. */
  clockTampered: boolean;
}

export interface SetupProgress {
  /** Short machine-readable phase name */
  phase: string;
  /** Human-readable message to display */
  message: string;
}

// ─── Tauri invoke helper ─────────────────────────────────────────────────────

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function getTauriInvoke(): TauriInvoke | null {
  if (!isTauri()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__TAURI_INTERNALS__?.invoke ?? null;
}

// ─── Event listener helper ───────────────────────────────────────────────────

type UnlistenFn = () => void;

/**
 * Listen for Tauri events. Returns an unlisten function.
 * No-op when not in Tauri.
 */
export async function listenTauri<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>(event, (e) => handler(e.payload));
}

// ─── Setup events ────────────────────────────────────────────────────────────

/**
 * Subscribe to embedded-database startup progress events.
 * Fires multiple times with phase/message until "setup:done" or "setup:error".
 */
export async function onSetupProgress(
  onProgress: (p: SetupProgress) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    // In browser dev mode, immediately call done
    setTimeout(onDone, 100);
    return () => {};
  }

  const { listen } = await import('@tauri-apps/api/event');
  const unlisteners: UnlistenFn[] = [];

  unlisteners.push(
    await listen<SetupProgress>('setup:progress', (e) => onProgress(e.payload)),
    await listen<void>('setup:done',    ()  => { onDone();         cleanup(); }),
    await listen<string>('setup:error', (e) => { onError(e.payload); cleanup(); }),
  );

  function cleanup() {
    unlisteners.forEach((u) => u());
  }

  return cleanup;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run the daily license check on startup.
 * Verifies HMAC, expiry, and clock-tamper detection.
 * Writes an updated check record if valid.
 * Returns null when not in Tauri.
 */
export async function getLicenseInfo(): Promise<LicenseVerifyResult | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke('get_license_info') as Promise<LicenseVerifyResult>;
}

/**
 * Verify a license key string without saving it (UI preview step).
 */
export async function verifyLicenseKey(key: string): Promise<LicenseVerifyResult | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke('verify_license_key', { key }) as Promise<LicenseVerifyResult>;
}

/**
 * Verify and save a license key to disk, then write initial daily-check record.
 */
export async function saveLicenseKey(key: string): Promise<LicenseVerifyResult | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke('save_license_key', { key }) as Promise<LicenseVerifyResult>;
}

/**
 * Get the app data directory path (for support diagnostics).
 */
export async function getAppDataDir(): Promise<string | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke('get_app_data_dir') as Promise<string>;
}
