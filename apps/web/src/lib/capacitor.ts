/**
 * Capacitor bridge — provides type-safe wrappers for mobile native features.
 * Falls back gracefully when running in a browser/desktop context.
 */

// Check if running inside a Capacitor native app (Android/iOS)
export const isCapacitor = (): boolean => {
  return typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>)['Capacitor'];
};

export const isAndroid = (): boolean => {
  if (!isCapacitor()) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Capacitor?.getPlatform?.() === 'android';
};

export const isIOS = (): boolean => {
  if (!isCapacitor()) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Capacitor?.getPlatform?.() === 'ios';
};

/**
 * Returns the base API URL for the current environment.
 * - Capacitor Android emulator: 10.0.2.2 (loopback to host)
 * - Production: reads from localStorage setting or falls back to env
 */
export function getApiBaseUrl(): string {
  // User-configured server URL (set in Settings page)
  const saved = localStorage.getItem('pos_server_url');
  if (saved) return saved.replace(/\/$/, '');

  // Android emulator default
  if (isAndroid()) return 'http://10.0.2.2:4000';

  // Web / desktop default
  return import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
}

/**
 * Trigger a light haptic feedback tap.
 * No-op on non-mobile platforms.
 */
export async function hapticTap(): Promise<void> {
  if (!isCapacitor()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Haptics not available
  }
}

/**
 * Trigger a medium haptic feedback (e.g. on order submit).
 */
export async function hapticMedium(): Promise<void> {
  if (!isCapacitor()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // Haptics not available
  }
}

/**
 * Hide the native splash screen.
 * Call this after the app has finished its initial load.
 */
export async function hideSplashScreen(): Promise<void> {
  if (!isCapacitor()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {
    // SplashScreen not available
  }
}

