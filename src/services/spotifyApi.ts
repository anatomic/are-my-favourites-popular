/**
 * Spotify API Service
 *
 * Centralized API client for all Spotify API interactions.
 * Handles authentication headers, error handling, rate limiting, and pagination.
 */

import { SPOTIFY_API_BASE } from '../config';
import { getValidAccessToken } from './tokenService';
import { SPOTIFY, RATE_LIMIT } from '../constants';
import { SpotifyApiError, RateLimitError } from '../utils/errors';
import { loggers } from '../utils/logger';
import type {
  SavedTrack,
  SpotifyArtist,
  SpotifyUserProfile,
} from '../types/spotify';

const log = loggers.api;

// Re-export error classes for convenience
export { SpotifyApiError, RateLimitError };

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelay: number = RATE_LIMIT.MIN_RETRY_DELAY_MS
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  // Use ± jitter to better distribute retry timing and avoid thundering herd
  const jitter =
    exponentialDelay * RATE_LIMIT.JITTER_FACTOR * (Math.random() - 0.5);
  return Math.min(exponentialDelay + jitter, RATE_LIMIT.MAX_RETRY_DELAY_MS);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an authenticated request to the Spotify API with rate limit handling
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retryCount: number = 0
): Promise<T> {
  const accessToken = await getValidAccessToken();

  const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle rate limiting (429)
  if (response.status === 429) {
    // Parse Retry-After header - can be seconds (integer) or HTTP-date
    const retryAfterHeader = response.headers.get('Retry-After');
    let retryAfterSeconds: number = RATE_LIMIT.DEFAULT_RETRY_AFTER_S;

    if (retryAfterHeader != null) {
      const numericValue = Number(retryAfterHeader);

      if (!Number.isNaN(numericValue) && numericValue > 0) {
        // Header is a number of seconds
        retryAfterSeconds = numericValue;
      } else {
        // Header might be an HTTP-date
        const retryAfterDateMs = Date.parse(retryAfterHeader);
        if (!Number.isNaN(retryAfterDateMs)) {
          const diffMs = retryAfterDateMs - Date.now();
          if (diffMs > 0) {
            retryAfterSeconds = Math.ceil(diffMs / 1000);
          }
        }
      }
    }

    if (retryCount >= RATE_LIMIT.MAX_RETRIES) {
      throw new RateLimitError(
        retryAfterSeconds,
        'Rate limit exceeded after max retries'
      );
    }

    log.warn(
      `Rate limited. Retrying after ${retryAfterSeconds}s (attempt ${retryCount + 1}/${RATE_LIMIT.MAX_RETRIES})`
    );

    await sleep(retryAfterSeconds * 1000);
    return apiRequest<T>(endpoint, options, retryCount + 1);
  }

  // Handle server errors with retry
  if (response.status >= 500 && retryCount < RATE_LIMIT.MAX_RETRIES) {
    const delay = calculateBackoffDelay(retryCount);
    log.warn(
      `Server error ${response.status}. Retrying in ${Math.round(delay)}ms (attempt ${retryCount + 1}/${RATE_LIMIT.MAX_RETRIES})`
    );

    await sleep(delay);
    return apiRequest<T>(endpoint, options, retryCount + 1);
  }

  if (!response.ok) {
    const isRetryable = response.status >= 500;
    throw new SpotifyApiError(
      `API request failed: ${response.status} ${response.statusText}`,
      response.status,
      isRetryable
    );
  }

  // Handle 204 No Content responses (no body to parse)
  if (response.status === 204) {
    return null as T;
  }

  return response.json();
}

/**
 * Fetch the current user's profile
 */
export async function fetchUserProfile(): Promise<SpotifyUserProfile> {
  return apiRequest<SpotifyUserProfile>('v1/me');
}

interface PaginatedResponse {
  items: SavedTrack[];
  next: string | null;
}

/**
 * Fetch all saved tracks with automatic pagination
 */
export async function fetchAllSavedTracks(): Promise<SavedTrack[]> {
  const tracks: SavedTrack[] = [];
  let nextEndpoint: string | null =
    `v1/me/tracks?offset=0&limit=${SPOTIFY.BATCH_SIZE}`;

  while (nextEndpoint) {
    // Handle full URLs from pagination (strip base if present)
    const endpoint: string = nextEndpoint.startsWith('http')
      ? nextEndpoint.replace(SPOTIFY_API_BASE, '')
      : nextEndpoint;

    const data: PaginatedResponse =
      await apiRequest<PaginatedResponse>(endpoint);

    if (data.items) {
      tracks.push(...data.items);
    }

    // Extract relative path from next URL
    nextEndpoint = data.next ? data.next.replace(SPOTIFY_API_BASE, '') : null;
  }

  return tracks;
}

/**
 * Fetch artists by IDs (max 50 per request)
 */
export async function fetchArtists(
  artistIds: string[]
): Promise<SpotifyArtist[]> {
  if (artistIds.length === 0) {
    return [];
  }

  if (artistIds.length > SPOTIFY.BATCH_SIZE) {
    throw new Error(
      `Cannot fetch more than ${SPOTIFY.BATCH_SIZE} artists at once`
    );
  }

  const data = await apiRequest<{ artists: (SpotifyArtist | null)[] }>(
    `v1/artists?ids=${artistIds.join(',')}`
  );

  return data.artists.filter((a): a is SpotifyArtist => a !== null);
}

/**
 * Fetch artists in batches of 50, with parallel execution
 */
export async function fetchArtistsBatch(
  artistIds: string[],
  concurrency: number = SPOTIFY.DEFAULT_CONCURRENCY
): Promise<SpotifyArtist[]> {
  if (artistIds.length === 0) {
    return [];
  }

  // Split into batches of 50
  const batches: string[][] = [];
  for (let i = 0; i < artistIds.length; i += SPOTIFY.BATCH_SIZE) {
    batches.push(artistIds.slice(i, i + SPOTIFY.BATCH_SIZE));
  }

  // Process batches with limited concurrency
  const results: SpotifyArtist[] = [];

  for (let i = 0; i < batches.length; i += concurrency) {
    const batchGroup = batches.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batchGroup.map((batch) => fetchArtists(batch))
    );
    results.push(...batchResults.flat());
  }

  return results;
}

/**
 * Start playback on a specific device
 */
export async function startPlayback(
  deviceId: string,
  options: { uris?: string[]; context_uri?: string; position_ms?: number } = {}
): Promise<void> {
  await apiRequest(`v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify(options),
  });
}

/**
 * Pause playback
 */
export async function pausePlayback(deviceId?: string): Promise<void> {
  const endpoint = deviceId
    ? `v1/me/player/pause?device_id=${deviceId}`
    : 'v1/me/player/pause';

  await apiRequest(endpoint, { method: 'PUT' });
}

/**
 * Get current playback state
 * Returns null when no active player (204 No Content)
 */
export async function getPlaybackState(): Promise<{
  is_playing: boolean;
  item: { uri: string } | null;
  progress_ms: number;
  device: { id: string } | null;
} | null> {
  // apiRequest handles 204 No Content by returning null
  return apiRequest('v1/me/player');
}

/**
 * Transfer playback to a device
 */
export async function transferPlayback(
  deviceId: string,
  play: boolean = false
): Promise<void> {
  await apiRequest('v1/me/player', {
    method: 'PUT',
    body: JSON.stringify({
      device_ids: [deviceId],
      play,
    }),
  });
}
