/**
 * Tauri bridge — provides type-safe wrappers around Tauri commands.
 * Falls back gracefully when running in a browser (non-Tauri) context.
 */

// Check if running inside a Tauri app
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export interface LicensePayload {
  restaurantName: string;
  email: string;
  issuedAt: string;
  expiresAt: string | null;
  maxDevices: number;
  features: string[];
  licenseId: string;
}

export interface LicenseVerifyResult {
  valid: boolean;
  payload?: LicensePayload;
  reason?: string;
  daysRemaining?: number | null;
}

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function getTauriInvoke(): TauriInvoke | null {
  if (!isTauri()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__TAURI_INTERNALS__?.invoke ?? null;
}

/**
 * Read and verify the saved license key from disk.
 * Returns null when not running in Tauri.
 */
export async function getLicenseInfo(): Promise<LicenseVerifyResult | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke('get_license_info') as Promise<LicenseVerifyResult>;
}

/**
 * Verify a license key string without saving it.
 */
export async function verifyLicenseKey(key: string): Promise<LicenseVerifyResult | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke('verify_license_key', { key }) as Promise<LicenseVerifyResult>;
}

/**
 * Verify and save a license key to disk.
 */
export async function saveLicenseKey(key: string): Promise<LicenseVerifyResult | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke('save_license_key', { key }) as Promise<LicenseVerifyResult>;
}

/**
 * Get the app data directory path.
 */
export async function getAppDataDir(): Promise<string | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke('get_app_data_dir') as Promise<string>;
}

