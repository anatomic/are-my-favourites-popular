import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveTokens,
  clearTokens,
  getRefreshToken,
  getAccessToken,
  getExpiresAt,
  isTokenExpiringSoon,
  getCachedUserId,
  cacheUserId,
  getValidAccessToken,
  hasValidAuth,
  initializeAuth,
} from './tokenService';

// Mock the auth module
vi.mock('../auth', () => ({
  refreshAccessToken: vi.fn(),
}));

import { refreshAccessToken } from '../auth';

describe('tokenService', () => {
  // Storage mocks - separate data stores for session and local
  let sessionData: Record<string, string>;
  let localData: Record<string, string>;

  // Create mock storage objects
  const createStorageMock = (data: Record<string, string>) => ({
    getItem: vi.fn((key: string) => data[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete data[key];
    }),
    clear: vi.fn(() => {
      Object.keys(data).forEach((k) => delete data[k]);
    }),
    get length() {
      return Object.keys(data).length;
    },
    key: vi.fn((i: number) => Object.keys(data)[i] ?? null),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset storage data
    sessionData = {};
    localData = {};

    // Create new mocks for each test
    Object.defineProperty(window, 'sessionStorage', {
      value: createStorageMock(sessionData),
      writable: true,
    });

    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(localData),
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveTokens', () => {
    it('saves access token to sessionStorage', () => {
      saveTokens({
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'user-library-read',
      });

      expect(sessionData['spotify_access_token']).toBe('test-access-token');
    });

    it('saves expiration time based on expires_in', () => {
      const beforeSave = Date.now();

      saveTokens({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'user-library-read',
      });

      const savedExpiry = parseInt(sessionData['spotify_expires_at']);
      expect(savedExpiry).toBeGreaterThanOrEqual(beforeSave + 3600 * 1000);
      expect(savedExpiry).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
    });

    it('saves refresh token to localStorage if provided', () => {
      saveTokens({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token',
        scope: 'user-library-read',
      });

      expect(localData['spotify_refresh_token']).toBe('test-refresh-token');
    });

    it('clears cached user ID when saving tokens', () => {
      localData['spotify_user_id'] = 'old-user';

      saveTokens({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'user-library-read',
      });

      expect(localData['spotify_user_id']).toBeUndefined();
    });
  });

  describe('clearTokens', () => {
    it('removes all token-related items from storage', () => {
      sessionData['spotify_access_token'] = 'test-token';
      sessionData['spotify_expires_at'] = '12345';
      localData['spotify_refresh_token'] = 'refresh-token';
      localData['spotify_user_id'] = 'user123';

      clearTokens();

      expect(sessionData['spotify_access_token']).toBeUndefined();
      expect(sessionData['spotify_expires_at']).toBeUndefined();
      expect(localData['spotify_refresh_token']).toBeUndefined();
      expect(localData['spotify_user_id']).toBeUndefined();
    });
  });

  describe('getRefreshToken', () => {
    it('returns refresh token from localStorage', () => {
      localData['spotify_refresh_token'] = 'my-refresh-token';

      expect(getRefreshToken()).toBe('my-refresh-token');
    });

    it('returns null when no refresh token stored', () => {
      expect(getRefreshToken()).toBeNull();
    });
  });

  describe('getAccessToken', () => {
    it('returns access token from sessionStorage', () => {
      sessionData['spotify_access_token'] = 'my-access-token';

      expect(getAccessToken()).toBe('my-access-token');
    });
  });

  describe('getExpiresAt', () => {
    it('returns parsed expiration time', () => {
      sessionData['spotify_expires_at'] = '1700000000000';

      expect(getExpiresAt()).toBe(1700000000000);
    });

    it('returns null when no expiration stored', () => {
      expect(getExpiresAt()).toBeNull();
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('returns true when no expiration time is set', () => {
      expect(isTokenExpiringSoon()).toBe(true);
    });

    it('returns true when token expires within buffer', () => {
      sessionData['spotify_expires_at'] = String(Date.now() + 30000); // 30 seconds

      expect(isTokenExpiringSoon(60000)).toBe(true); // 60 second buffer
    });

    it('returns false when token has plenty of time', () => {
      sessionData['spotify_expires_at'] = String(Date.now() + 3600000); // 1 hour

      expect(isTokenExpiringSoon(60000)).toBe(false);
    });
  });

  describe('getCachedUserId / cacheUserId', () => {
    it('caches and retrieves user ID', () => {
      expect(getCachedUserId()).toBeNull();

      cacheUserId('user123');

      expect(getCachedUserId()).toBe('user123');
    });
  });

  describe('getValidAccessToken', () => {
    it('returns cached token if not expired', async () => {
      sessionData['spotify_access_token'] = 'valid-token';
      sessionData['spotify_expires_at'] = String(Date.now() + 3600000);

      const token = await getValidAccessToken();

      expect(token).toBe('valid-token');
      expect(refreshAccessToken).not.toHaveBeenCalled();
    });

    it('refreshes token if expired', async () => {
      sessionData['spotify_access_token'] = 'expired-token';
      sessionData['spotify_expires_at'] = String(Date.now() - 1000);
      localData['spotify_refresh_token'] = 'refresh-token';

      vi.mocked(refreshAccessToken).mockResolvedValueOnce({
        access_token: 'new-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'new-refresh',
        scope: 'user-library-read',
      });

      const token = await getValidAccessToken();

      expect(token).toBe('new-token');
      expect(refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    });

    it('throws 401 error when refresh fails', async () => {
      sessionData['spotify_access_token'] = 'expired-token';
      sessionData['spotify_expires_at'] = String(Date.now() - 1000);
      localData['spotify_refresh_token'] = 'invalid-refresh';

      vi.mocked(refreshAccessToken).mockRejectedValueOnce(new Error('Invalid grant'));

      await expect(getValidAccessToken()).rejects.toMatchObject({
        message: 'Session expired. Please log in again.',
        status: 401,
      });
    });

    it('throws 401 error when no tokens available', async () => {
      await expect(getValidAccessToken()).rejects.toMatchObject({
        message: 'No access token available. Please log in.',
        status: 401,
      });
    });

    it('uses mutex to prevent concurrent refreshes', async () => {
      sessionData['spotify_access_token'] = 'expired-token';
      sessionData['spotify_expires_at'] = String(Date.now() - 1000);
      localData['spotify_refresh_token'] = 'refresh-token';

      vi.mocked(refreshAccessToken).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  access_token: 'new-token',
                  token_type: 'Bearer',
                  expires_in: 3600,
                  scope: 'user-library-read',
                }),
              100
            )
          )
      );

      // Call getValidAccessToken concurrently
      const [token1, token2] = await Promise.all([getValidAccessToken(), getValidAccessToken()]);

      // Both should get the same new token
      expect(token1).toBe('new-token');
      expect(token2).toBe('new-token');
      // But refresh should only be called once
      expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasValidAuth', () => {
    it('returns true with valid access token', () => {
      sessionData['spotify_access_token'] = 'valid-token';
      sessionData['spotify_expires_at'] = String(Date.now() + 3600000);

      expect(hasValidAuth()).toBe(true);
    });

    it('returns true with refresh token even if access expired', () => {
      sessionData['spotify_access_token'] = 'expired-token';
      sessionData['spotify_expires_at'] = String(Date.now() - 1000);
      localData['spotify_refresh_token'] = 'refresh-token';

      expect(hasValidAuth()).toBe(true);
    });

    it('returns false with no tokens', () => {
      expect(hasValidAuth()).toBe(false);
    });
  });

  describe('initializeAuth', () => {
    it('returns true when valid access token exists', async () => {
      sessionData['spotify_access_token'] = 'valid-token';
      sessionData['spotify_expires_at'] = String(Date.now() + 3600000);

      const result = await initializeAuth();

      expect(result).toBe(true);
      expect(refreshAccessToken).not.toHaveBeenCalled();
    });

    it('refreshes and returns true when access expired but refresh available', async () => {
      sessionData['spotify_access_token'] = 'expired-token';
      sessionData['spotify_expires_at'] = String(Date.now() - 1000);
      localData['spotify_refresh_token'] = 'refresh-token';

      vi.mocked(refreshAccessToken).mockResolvedValueOnce({
        access_token: 'new-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'user-library-read',
      });

      const result = await initializeAuth();

      expect(result).toBe(true);
      expect(refreshAccessToken).toHaveBeenCalled();
    });

    it('returns false when no tokens stored', async () => {
      const result = await initializeAuth();

      expect(result).toBe(false);
    });

    it('clears tokens and returns false when refresh fails', async () => {
      localData['spotify_refresh_token'] = 'invalid-refresh';

      vi.mocked(refreshAccessToken).mockRejectedValueOnce(new Error('Invalid'));

      const result = await initializeAuth();

      expect(result).toBe(false);
      expect(localData['spotify_refresh_token']).toBeUndefined();
    });
  });
});
