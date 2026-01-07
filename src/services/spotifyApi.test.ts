import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchUserProfile,
  fetchAllSavedTracks,
  fetchArtists,
  fetchArtistsBatch,
  getPlaybackState,
  SpotifyApiError,
  RateLimitError,
} from './spotifyApi';

// Mock tokenService
vi.mock('./tokenService', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('spotifyApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchUserProfile', () => {
    it('fetches user profile successfully', async () => {
      const mockProfile = {
        id: 'user123',
        display_name: 'Test User',
        email: 'test@example.com',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockProfile),
      });

      const result = await fetchUserProfile();

      expect(result).toEqual(mockProfile);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/me'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-access-token',
          }),
        })
      );
    });

    it('throws SpotifyApiError on failed request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      await expect(fetchUserProfile()).rejects.toThrow(SpotifyApiError);
    });
  });

  describe('fetchAllSavedTracks', () => {
    it('fetches single page of tracks', async () => {
      const mockTracks = [
        { added_at: '2024-01-01', track: { id: '1', name: 'Track 1' } },
        { added_at: '2024-01-02', track: { id: '2', name: 'Track 2' } },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items: mockTracks, next: null }),
      });

      const result = await fetchAllSavedTracks();

      expect(result).toEqual(mockTracks);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('handles pagination correctly', async () => {
      const page1 = [{ added_at: '2024-01-01', track: { id: '1' } }];
      const page2 = [{ added_at: '2024-01-02', track: { id: '2' } }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              items: page1,
              next: 'https://api.spotify.com/v1/me/tracks?offset=50',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: page2, next: null }),
        });

      const result = await fetchAllSavedTracks();

      expect(result).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchArtists', () => {
    it('fetches artists by IDs', async () => {
      const mockArtists = [
        { id: 'artist1', name: 'Artist 1' },
        { id: 'artist2', name: 'Artist 2' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ artists: mockArtists }),
      });

      const result = await fetchArtists(['artist1', 'artist2']);

      expect(result).toEqual(mockArtists);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('v1/artists?ids=artist1,artist2'),
        expect.any(Object)
      );
    });

    it('returns empty array for empty input', async () => {
      const result = await fetchArtists([]);

      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws error if more than 50 artists requested', async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `artist${i}`);

      await expect(fetchArtists(ids)).rejects.toThrow(
        'Cannot fetch more than 50 artists at once'
      );
    });

    it('filters out null artists from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            artists: [{ id: 'artist1', name: 'Artist 1' }, null],
          }),
      });

      const result = await fetchArtists(['artist1', 'deleted-artist']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('artist1');
    });
  });

  describe('fetchArtistsBatch', () => {
    it('returns empty array for empty input', async () => {
      const result = await fetchArtistsBatch([]);

      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('batches requests for large artist lists', async () => {
      const ids = Array.from({ length: 100 }, (_, i) => `artist${i}`);

      // Mock two batches (50 each)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              artists: ids.slice(0, 50).map((id) => ({ id, name: `Name ${id}` })),
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              artists: ids.slice(50).map((id) => ({ id, name: `Name ${id}` })),
            }),
        });

      const result = await fetchArtistsBatch(ids, 1);

      expect(result).toHaveLength(100);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('respects concurrency limit', async () => {
      const ids = Array.from({ length: 150 }, (_, i) => `artist${i}`);
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      mockFetch.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
        await new Promise((r) => setTimeout(r, 10));
        concurrentCalls--;
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ artists: [] }),
        };
      });

      await fetchArtistsBatch(ids, 2);

      // Should batch in groups of 2 concurrent requests
      expect(maxConcurrentCalls).toBeLessThanOrEqual(2);
    });
  });

  describe('rate limiting', () => {
    it('retries after rate limit with Retry-After header', async () => {
      vi.useFakeTimers();
      try {
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 429,
            headers: new Headers({ 'Retry-After': '1' }),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'user123' }),
          });

        const promise = fetchUserProfile();

        // Fast-forward past retry delay
        await vi.runAllTimersAsync();

        const result = await promise;

        expect(result).toEqual({ id: 'user123' });
        expect(mockFetch).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('throws RateLimitError after max retries', async () => {
      vi.useFakeTimers();
      try {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '1' }),
        });

        const promise = fetchUserProfile();
        // Prevent unhandled rejection warning during timer advancement
        promise.catch(() => {});

        // Run through all retry attempts
        for (let i = 0; i < 5; i++) {
          await vi.runAllTimersAsync();
        }

        await expect(promise).rejects.toThrow(RateLimitError);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('server error retry', () => {
    it('retries on 500 errors with exponential backoff', async () => {
      vi.useFakeTimers();
      try {
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'user123' }),
          });

        const promise = fetchUserProfile();

        // Fast-forward past retry delay
        await vi.runAllTimersAsync();

        const result = await promise;

        expect(result).toEqual({ id: 'user123' });
        expect(mockFetch).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('throws SpotifyApiError after max retries on server error', async () => {
      vi.useFakeTimers();
      try {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        });

        const promise = fetchUserProfile();
        // Prevent unhandled rejection warning during timer advancement
        promise.catch(() => {});

        // Run through all retry attempts
        for (let i = 0; i < 5; i++) {
          await vi.runAllTimersAsync();
        }

        await expect(promise).rejects.toThrow(SpotifyApiError);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('204 No Content handling', () => {
    it('returns null for 204 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await getPlaybackState();

      expect(result).toBeNull();
    });
  });
});
