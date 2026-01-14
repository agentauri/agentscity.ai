/**
 * Authentication Store (OAuth Only)
 *
 * Manages user authentication state with OAuth providers (Google, GitHub).
 * - Access tokens stored in memory (for security)
 * - Refresh tokens handled via httpOnly cookies (by backend)
 * - Auto-refresh before token expiration
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
}

export interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setAccessToken: (token: string, expiresIn: number) => void;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  fetchUser: () => Promise<void>;
  clearError: () => void;
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = '';

interface UserResponse {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
}

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

async function logoutAPI(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

async function refreshAPI(): Promise<RefreshResponse> {
  const response = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  return response.json();
}

async function fetchUserAPI(accessToken: string): Promise<UserResponse> {
  const response = await fetch(`${API_BASE}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }

  return response.json();
}

// =============================================================================
// Token Refresh Timer
// =============================================================================

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleTokenRefresh(expiresIn: number, refreshFn: () => Promise<boolean>) {
  // Clear existing timer
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  // Refresh 1 minute before expiration (or at half time if less than 2 minutes)
  const refreshTime = expiresIn > 120 ? (expiresIn - 60) * 1000 : (expiresIn / 2) * 1000;

  refreshTimer = setTimeout(async () => {
    console.log('[Auth] Auto-refreshing token...');
    await refreshFn();
  }, refreshTime);
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

// =============================================================================
// Store
// =============================================================================

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  // Set access token (called after OAuth callback)
  setAccessToken: (token: string, expiresIn: number) => {
    set({
      accessToken: token,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });

    // Schedule token refresh
    scheduleTokenRefresh(expiresIn, get().refreshToken);

    // Fetch user info
    get().fetchUser();
  },

  // Logout
  logout: async () => {
    set({ isLoading: true });

    try {
      await logoutAPI();
    } catch (e) {
      console.warn('[Auth] Logout API error:', e);
    }

    clearRefreshTimer();
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  // Refresh token
  refreshToken: async () => {
    try {
      const response = await refreshAPI();

      set({
        accessToken: response.accessToken,
        isAuthenticated: true,
      });

      // Schedule next refresh
      scheduleTokenRefresh(response.expiresIn, get().refreshToken);

      return true;
    } catch (e) {
      console.warn('[Auth] Token refresh failed:', e);
      // Clear auth state on refresh failure
      clearRefreshTimer();
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
      });
      return false;
    }
  },

  // Fetch user info
  fetchUser: async () => {
    const { accessToken } = get();
    if (!accessToken) return;

    try {
      const user = await fetchUserAPI(accessToken);
      set({ user });
    } catch (e) {
      console.warn('[Auth] Failed to fetch user:', e);
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);
export const useAccessToken = () => useAuthStore((state) => state.accessToken);

// =============================================================================
// Initialize: Handle OAuth callback and try to refresh token on page load
// =============================================================================

export async function initializeAuth(): Promise<boolean> {
  const store = useAuthStore.getState();

  // Check for OAuth callback params in URL
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token');
  const expiresIn = params.get('expires_in');
  const authError = params.get('auth_error');

  // Handle auth error
  if (authError) {
    console.error('[Auth] OAuth error:', authError);
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    return false;
  }

  // Handle successful OAuth callback
  if (accessToken && expiresIn) {
    console.log('[Auth] OAuth callback received');
    store.setAccessToken(accessToken, parseInt(expiresIn, 10));
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    return true;
  }

  // Try to refresh token (will use httpOnly cookie)
  const success = await store.refreshToken();

  if (success) {
    await store.fetchUser();
  }

  return success;
}

// =============================================================================
// OAuth Helpers
// =============================================================================

const getApiBase = () => {
  // In production, use relative URL. In dev, might need to specify backend URL.
  return '';
};

export function loginWithGoogle() {
  window.location.href = `${getApiBase()}/api/auth/google`;
}

export function loginWithGithub() {
  window.location.href = `${getApiBase()}/api/auth/github`;
}
