import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  exchangeCodeForToken,
  refreshAccessToken,
} from './auth';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateCodeVerifier', () => {
    it('generates a string of default length 64', () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toHaveLength(64);
    });

    it('generates a string of custom length', () => {
      const verifier = generateCodeVerifier(128);
      expect(verifier).toHaveLength(128);
    });

    it('only contains valid PKCE characters', () => {
      const verifier = generateCodeVerifier();
      const validChars = /^[A-Za-z0-9\-._~]+$/;
      expect(verifier).toMatch(validChars);
    });

    it('generates different values each time', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      expect(verifier1).not.toBe(verifier2);
    });
  });

  describe('generateCodeChallenge', () => {
    it('generates a base64url encoded challenge', async () => {
      const verifier = 'test-verifier';
      const challenge = await generateCodeChallenge(verifier);

      // Should be base64url encoded (no +, /, or = padding)
      expect(challenge).not.toContain('+');
      expect(challenge).not.toContain('/');
      expect(challenge).not.toContain('=');
    });

    it('generates consistent challenge for same verifier', async () => {
      const verifier = 'consistent-test-verifier';
      const challenge1 = await generateCodeChallenge(verifier);
      const challenge2 = await generateCodeChallenge(verifier);
      expect(challenge1).toBe(challenge2);
    });
  });

  describe('exchangeCodeForToken', () => {
    const mockTokenResponse = {
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh-token',
      scope: 'user-library-read',
    };

    it('exchanges code for token successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      });

      const result = await exchangeCodeForToken(
        'auth-code',
        'code-verifier',
        'http://localhost:3000/callback'
      );

      expect(result).toEqual(mockTokenResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/token'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );
    });

    it('includes correct parameters in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      });

      await exchangeCodeForToken(
        'auth-code',
        'code-verifier',
        'http://localhost:3000/callback'
      );

      const call = mockFetch.mock.calls[0];
      const body = call[1].body as URLSearchParams;

      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('auth-code');
      expect(body.get('code_verifier')).toBe('code-verifier');
      expect(body.get('redirect_uri')).toBe('http://localhost:3000/callback');
      expect(body.get('client_id')).toBeDefined();
    });

    it('throws error on failed exchange', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'Authorization code expired',
          }),
      });

      await expect(
        exchangeCodeForToken('expired-code', 'verifier', 'http://localhost:3000')
      ).rejects.toThrow('Authorization code expired');
    });

    it('throws generic error when no description provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'server_error' }),
      });

      await expect(
        exchangeCodeForToken('code', 'verifier', 'http://localhost:3000')
      ).rejects.toThrow('Token exchange failed');
    });
  });

  describe('refreshAccessToken', () => {
    const mockRefreshResponse = {
      access_token: 'new-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'new-refresh-token',
      scope: 'user-library-read',
    };

    it('refreshes token successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRefreshResponse),
      });

      const result = await refreshAccessToken('old-refresh-token');

      expect(result).toEqual(mockRefreshResponse);
    });

    it('includes correct parameters in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRefreshResponse),
      });

      await refreshAccessToken('my-refresh-token');

      const call = mockFetch.mock.calls[0];
      const body = call[1].body as URLSearchParams;

      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('my-refresh-token');
    });

    it('throws error on failed refresh', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'Refresh token revoked',
          }),
      });

      await expect(refreshAccessToken('revoked-token')).rejects.toThrow(
        'Refresh token revoked'
      );
    });

    it('throws generic error when no description provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'server_error' }),
      });

      await expect(refreshAccessToken('token')).rejects.toThrow(
        'Token refresh failed'
      );
    });
  });
});
