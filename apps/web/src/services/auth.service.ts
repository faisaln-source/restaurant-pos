/**
 * Auth service — login, profile, password (via Express API).
 */
import api, {
  setAccessToken, setRefreshToken, clearTokens, getRefreshToken,
} from '../lib/api';
import type { UserProfile, AuthTokens } from '../lib/types';

// ── Login with email + password ────────────────────────────────────────────
export async function loginWithEmail(
  email: string,
  password: string,
): Promise<AuthTokens> {
  const data = await api.post<AuthTokens>('/api/auth/login', { email, password }, { noAuth: true });
  setAccessToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  return data;
}

// ── PIN login ─────────────────────────────────────────────────────────────
export async function loginWithPin(pin: string): Promise<AuthTokens> {
  const data = await api.post<AuthTokens>('/api/auth/pin-login', { pin }, { noAuth: true });
  setAccessToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  return data;
}

// ── Fetch current user profile ────────────────────────────────────────────
export async function fetchUserProfile(): Promise<UserProfile | null> {
  try {
    const data = await api.get<{ userId: string; email: string; role: string }>('/api/auth/me');
    // The /me endpoint returns the JWT payload, not the full profile.
    // Construct a minimal profile from it.
    return {
      id: data.userId,
      email: data.email,
      role: data.role as UserProfile['role'],
      name: data.email.split('@')[0],
      isActive: true,
      createdAt: '',
      updatedAt: '',
    };
  } catch {
    return null;
  }
}

// ── Create user profile (register) ────────────────────────────────────────
export async function createUserProfile(
  _uid: string,
  data: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>,
) {
  // On the API, registration creates the user. This is kept for compatibility.
  // The API register endpoint handles this.
  await api.post('/api/auth/register', {
    name: data.name,
    email: data.email,
    password: 'Temp1234!', // default password for auto-created accounts
    role: data.role,
  }, { noAuth: true });
}

// ── Logout ─────────────────────────────────────────────────────────────────
export async function logout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await api.post('/api/auth/logout', { refreshToken });
    } catch { /* ignore */ }
  }
  clearTokens();
}

// ── Change password ────────────────────────────────────────────────────────
export async function changePassword(currentPassword: string, newPassword: string) {
  await api.patch('/api/auth/change-password', { currentPassword, newPassword });
}

// ── Update profile ─────────────────────────────────────────────────────────
export async function updateUserProfile(_uid: string, _data: Partial<UserProfile>) {
  // The API doesn't have a dedicated profile update endpoint for self.
  // For now, this is a no-op. Staff updates are done via the staff service.
  // Could be extended later.
}

// ── Try to restore session from stored refresh token ───────────────────────
export async function tryRestoreSession(): Promise<AuthTokens | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const data = await api.post<AuthTokens>(
      '/api/auth/refresh',
      { refreshToken },
      { noAuth: true },
    );
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    return data;
  } catch {
    clearTokens();
    return null;
  }
}
