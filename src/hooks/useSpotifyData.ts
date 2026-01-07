/**
 * useSpotifyData Hook
 *
 * Manages fetching and caching of Spotify tracks and artists.
 * Provides loading states and error handling.
 */

import { useState, useEffect, useCallback } from 'react';
import { getSpotifyCache } from '../cache';
import { fetchAllSavedTracks, fetchArtistsBatch } from '../services/spotifyApi';
import { loggers } from '../utils/logger';
import type { SavedTrack, ArtistMap } from '../types/spotify';

const log = loggers.app;

interface SpotifyDataState {
  tracks: SavedTrack[] | null;
  artistMap: ArtistMap | null;
  isLoading: boolean;
  error: string | null;
}

interface UseSpotifyDataResult extends SpotifyDataState {
  refresh: () => Promise<void>;
}

const spotifyCache = getSpotifyCache();

export function useSpotifyData(
  userId: string | null,
  isAuthenticated: boolean,
  onAuthError?: () => void
): UseSpotifyDataResult {
  const [state, setState] = useState<SpotifyDataState>({
    tracks: null,
    artistMap: null,
    isLoading: true,
    error: null,
  });

  const loadData = useCallback(async () => {
    if (!userId || !isAuthenticated) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Initialize cache
      await spotifyCache.init();

      // Try to load from cache first
      const cachedTracks = await spotifyCache.getCachedTracks(userId);

      if (cachedTracks) {
        setState(prev => ({ ...prev, tracks: cachedTracks }));

        // Load artists for cached tracks
        const artists = await loadArtistsForTracks(cachedTracks);
        setState(prev => ({
          ...prev,
          artistMap: artists,
          isLoading: false,
        }));
        return;
      }

      // No cache, fetch from API
      const tracks = await fetchAllSavedTracks();
      setState(prev => ({ ...prev, tracks }));

      // Cache the tracks
      await spotifyCache.cacheTracks(userId, tracks);

      // Load artists
      const artists = await loadArtistsForTracks(tracks);
      setState({
        tracks,
        artistMap: artists,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      log.error('Failed to load Spotify data:', err);

      // Check for 401 status on any error type (SpotifyApiError or plain Error from tokenService)
      const errorStatus = (err as { status?: number }).status;
      if (errorStatus === 401) {
        onAuthError?.();
        return;
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load tracks. Please try again.',
      }));
    }
  }, [userId, isAuthenticated, onAuthError]);

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated && userId) {
      loadData();
    }
  }, [isAuthenticated, userId, loadData]);

  const refresh = useCallback(async () => {
    if (!userId) return;

    // Clear cache and reload
    await spotifyCache.invalidateUserCache(userId);
    await loadData();
  }, [userId, loadData]);

  return {
    ...state,
    refresh,
  };
}

/**
 * Load artist data for tracks, using cache when available
 */
async function loadArtistsForTracks(tracks: SavedTrack[]): Promise<ArtistMap> {
  // Extract unique artist IDs
  const artistIds = [...new Set(
    tracks.flatMap(t => t.track.artists.map(a => a.id))
  )];

  // Check which artists are already cached
  const { cachedArtists, uncachedIds } = await spotifyCache.getCachedArtists(artistIds);

  // Start with cached artists
  const artistMap: ArtistMap = new Map(cachedArtists);

  // Fetch uncached artists from API (with parallel batching)
  if (uncachedIds.length > 0) {
    const fetchedArtists = await fetchArtistsBatch(uncachedIds, 3);

    // Add to map and cache
    fetchedArtists.forEach(artist => {
      artistMap.set(artist.id, artist);
    });

    if (fetchedArtists.length > 0) {
      await spotifyCache.cacheArtists(fetchedArtists);
    }
  }

  return artistMap;
}

/**
 * Clear all user-specific caches
 */
export async function clearUserCache(userId: string): Promise<void> {
  try {
    await spotifyCache.invalidateUserCache(userId);
  } catch (err) {
    log.warn('Failed to invalidate user cache:', err);
  }
}

/**
 * Clear all caches (for logout without userId)
 */
export async function clearAllCaches(): Promise<void> {
  try {
    await spotifyCache.clearAllCaches();
  } catch (err) {
    log.warn('Failed to clear caches:', err);
  }
}
