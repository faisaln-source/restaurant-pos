import { create } from 'zustand';
import type { UserProfile } from '../lib/types';

interface AuthState {
  /** User profile from the API */
  profile: UserProfile | null;
  /** Whether we're checking auth on startup */
  loading: boolean;
  /** True if the user is authenticated (has valid tokens) */
  isAuthenticated: boolean;

  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setAuthenticated: (auth: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  loading: true,
  isAuthenticated: false,

  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  reset: () => set({ profile: null, loading: false, isAuthenticated: false }),
}));
