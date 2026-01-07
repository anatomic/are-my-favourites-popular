/**
 * Spotify API Service
 *
 * Centralized API client for all Spotify API interactions.
 * Handles authentication headers, error handling, and pagination.
 */

import { SPOTIFY_API_BASE } from '../config';
import { getValidAccessToken } from './tokenService';
import type { SavedTrack, SpotifyArtist, SpotifyUserProfile } from '../types/spotify';

/**
 * Custom error class for API errors with status code
 */
export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

/**
 * Make an authenticated request to the Spotify API
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
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

  if (!response.ok) {
    const isRetryable = response.status === 429 || response.status >= 500;
    throw new SpotifyApiError(
      `API request failed: ${response.status} ${response.statusText}`,
      response.status,
      isRetryable
    );
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
  let nextEndpoint: string | null = 'v1/me/tracks?offset=0&limit=50';

  while (nextEndpoint) {
    // Handle full URLs from pagination (strip base if present)
    const endpoint: string = nextEndpoint.startsWith('http')
      ? nextEndpoint.replace(SPOTIFY_API_BASE, '')
      : nextEndpoint;

    const data: PaginatedResponse = await apiRequest<PaginatedResponse>(endpoint);

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
export async function fetchArtists(artistIds: string[]): Promise<SpotifyArtist[]> {
  if (artistIds.length === 0) {
    return [];
  }

  if (artistIds.length > 50) {
    throw new Error('Cannot fetch more than 50 artists at once');
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
  concurrency: number = 3
): Promise<SpotifyArtist[]> {
  if (artistIds.length === 0) {
    return [];
  }

  // Split into batches of 50
  const batches: string[][] = [];
  for (let i = 0; i < artistIds.length; i += 50) {
    batches.push(artistIds.slice(i, i + 50));
  }

  // Process batches with limited concurrency
  const results: SpotifyArtist[] = [];

  for (let i = 0; i < batches.length; i += concurrency) {
    const batchGroup = batches.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batchGroup.map(batch => fetchArtists(batch))
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
 */
export async function getPlaybackState(): Promise<{
  is_playing: boolean;
  item: { uri: string } | null;
  progress_ms: number;
  device: { id: string } | null;
} | null> {
  try {
    return await apiRequest('v1/me/player');
  } catch (error) {
    // 204 No Content means no active player
    if (error instanceof SpotifyApiError && error.status === 204) {
      return null;
    }
    throw error;
  }
}

/**
 * Transfer playback to a device
 */
export async function transferPlayback(deviceId: string, play: boolean = false): Promise<void> {
  await apiRequest('v1/me/player', {
    method: 'PUT',
    body: JSON.stringify({
      device_ids: [deviceId],
      play,
    }),
  });
}
