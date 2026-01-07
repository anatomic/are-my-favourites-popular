/**
 * Token Service - Secure token management with mutex for refresh operations
 *
 * Security improvements:
 * - Access token stored in sessionStorage (cleared on tab close, protected from XSS persistence)
 * - Refresh token stored in localStorage (needed for session persistence)
 * - Mutex prevents race conditions when multiple requests try to refresh simultaneously
 */

import { refreshAccessToken } from '../auth';
import type { SpotifyTokenResponse } from '../types/spotify';

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'spotify_access_token',
  EXPIRES_AT: 'spotify_expires_at',
  REFRESH_TOKEN: 'spotify_refresh_token',
  USER_ID: 'spotify_user_id',
} as const;

// Token refresh mutex state
let refreshPromise: Promise<SpotifyTokenResponse> | null = null;

/**
 * Save tokens after authentication or refresh
 * - Access token → sessionStorage (more secure, cleared on tab close)
 * - Refresh token → localStorage (persists for re-authentication)
 */
export function saveTokens(tokenData: SpotifyTokenResponse): void {
  // Access token in sessionStorage - cleared when tab closes
  sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokenData.access_token);
  sessionStorage.setItem(
    STORAGE_KEYS.EXPIRES_AT,
    String(Date.now() + tokenData.expires_in * 1000)
  );

  // Refresh token in localStorage - persists across sessions
  if (tokenData.refresh_token) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokenData.refresh_token);
  }

  // Clear cached user ID to force re-fetch on next load
  // Handles case where someone re-authorizes with a different account
  localStorage.removeItem(STORAGE_KEYS.USER_ID);
}

/**
 * Clear all tokens (logout)
 */
export function clearTokens(): void {
  sessionStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  sessionStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER_ID);
}

/**
 * Get stored refresh token
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}

/**
 * Get stored access token (without validation)
 */
export function getAccessToken(): string | null {
  return sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

/**
 * Get token expiration time
 */
export function getExpiresAt(): number | null {
  const expiresAt = sessionStorage.getItem(STORAGE_KEYS.EXPIRES_AT);
  return expiresAt ? parseInt(expiresAt) : null;
}

/**
 * Check if token is expired or expiring soon
 */
export function isTokenExpiringSoon(bufferMs: number = 60 * 1000): boolean {
  const expiresAt = getExpiresAt();
  if (!expiresAt) return true;
  return expiresAt < Date.now() + bufferMs;
}

/**
 * Get user ID from cache
 */
export function getCachedUserId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.USER_ID);
}

/**
 * Cache user ID
 */
export function cacheUserId(userId: string): void {
  localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
}

/**
 * Perform token refresh with mutex to prevent race conditions
 *
 * If a refresh is already in progress, this returns the same promise
 * to all callers, ensuring only one refresh request is made.
 */
async function refreshTokenWithMutex(): Promise<SpotifyTokenResponse> {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  // If a refresh is already in progress, return the same promise
  if (refreshPromise) {
    return refreshPromise;
  }

  // Start a new refresh
  refreshPromise = (async () => {
    try {
      const tokenData = await refreshAccessToken(refreshToken);
      saveTokens(tokenData);
      return tokenData;
    } finally {
      // Clear the mutex after completion (success or failure)
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Get a valid access token, refreshing if necessary
 *
 * This is the main method for obtaining a token for API requests.
 * It handles:
 * - Returning cached token if still valid
 * - Refreshing expired tokens with mutex protection
 * - Throwing appropriate errors if authentication fails
 */
export async function getValidAccessToken(): Promise<string> {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();

  // If token is still valid, return it
  if (accessToken && !isTokenExpiringSoon()) {
    return accessToken;
  }

  // Token expired or expiring - try to refresh
  if (refreshToken) {
    try {
      const tokenData = await refreshTokenWithMutex();
      return tokenData.access_token;
    } catch (error) {
      // Refresh failed - clear tokens and throw auth error
      clearTokens();
      const authError = new Error('Session expired. Please log in again.') as Error & { status?: number };
      authError.status = 401;
      throw authError;
    }
  }

  // No access token and no refresh token
  if (!accessToken) {
    const authError = new Error('No access token available. Please log in.') as Error & { status?: number };
    authError.status = 401;
    throw authError;
  }

  return accessToken;
}

/**
 * Check if user has valid authentication
 * Returns true if there's an access token or refresh token available
 */
export function hasValidAuth(): boolean {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();

  // Has valid access token
  if (accessToken && !isTokenExpiringSoon(5 * 60 * 1000)) {
    return true;
  }

  // Has refresh token (can restore session)
  if (refreshToken) {
    return true;
  }

  return false;
}

/**
 * Initialize authentication from stored tokens
 * Returns true if authentication was restored successfully
 */
export async function initializeAuth(): Promise<boolean> {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();

  // No stored tokens
  if (!accessToken && !refreshToken) {
    return false;
  }

  // Has valid access token
  if (accessToken && !isTokenExpiringSoon(5 * 60 * 1000)) {
    return true;
  }

  // Try to refresh with stored refresh token
  if (refreshToken) {
    try {
      await refreshTokenWithMutex();
      return true;
    } catch {
      clearTokens();
      return false;
    }
  }

  // Access token expired and no refresh token
  clearTokens();
  return false;
}
