/**
 * SpotifyCache - Spotify-specific caching logic
 *
 * Handles caching of tracks and artist data with appropriate TTLs
 * Works transparently - callers don't need to know about cache internals
 */

import { getCacheService, CacheService } from './CacheService';
import { CACHE_CONFIG } from './constants';
import type {
  SpotifyArtist,
  SavedTrack,
  TrackCacheEntry,
  ArtistCacheEntry,
  ArtistMap,
} from '../types/spotify';

const { STORES, TRACK_CACHE_TTL, ARTIST_CACHE_TTL } = CACHE_CONFIG;

interface CacheStats {
  storageType: string;
  trackCacheCount: number;
  artistCacheCount: number;
  trackTTL: number;
  artistTTL: number;
}

interface CachedArtistsResult {
  cachedArtists: ArtistMap;
  uncachedIds: string[];
}

class SpotifyCache {
  private _cacheService: CacheService;
  private _initialized: boolean;

  constructor() {
    this._cacheService = getCacheService();
    this._initialized = false;
  }

  /**
   * Initialize the cache
   */
  async init(): Promise<boolean> {
    if (this._initialized) return true;
    await this._cacheService.init();
    this._initialized = true;
    return true;
  }

  /**
   * Ensure cache is initialized
   */
  private async _ensureInit(): Promise<void> {
    if (!this._initialized) {
      await this.init();
    }
  }

  // ==================== TRACK CACHING ====================

  /**
   * Get cached tracks for a user
   * Returns null if cache is invalid or expired
   */
  async getCachedTracks(userId: string): Promise<SavedTrack[] | null> {
    await this._ensureInit();

    const cacheKey = `user_${userId}`;
    const cached = await this._cacheService.get<TrackCacheEntry>(
      STORES.TRACKS,
      cacheKey
    );

    if (!cached) return null;

    // Check if cache has expired
    if (this._cacheService.isExpired(cached.cachedAt, TRACK_CACHE_TTL)) {
      return null;
    }

    // Verify the cache belongs to the right user
    if (cached.userId !== userId) {
      return null;
    }

    return cached.items || null;
  }

  /**
   * Cache tracks for a user
   */
  async cacheTracks(userId: string, tracks: SavedTrack[]): Promise<boolean> {
    await this._ensureInit();

    const cacheKey = `user_${userId}`;
    const cacheEntry: TrackCacheEntry = {
      userId,
      items: tracks,
      cachedAt: Date.now(),
    };

    return this._cacheService.set(STORES.TRACKS, cacheKey, cacheEntry);
  }

  /**
   * Check if track cache is valid for a user
   */
  async isTrackCacheValid(userId: string): Promise<boolean> {
    const tracks = await this.getCachedTracks(userId);
    return tracks !== null;
  }

  /**
   * Invalidate track cache for a user
   */
  async invalidateTrackCache(userId: string): Promise<boolean> {
    await this._ensureInit();
    const cacheKey = `user_${userId}`;
    return this._cacheService.delete(STORES.TRACKS, cacheKey);
  }

  // ==================== ARTIST CACHING ====================

  /**
   * Get cached artists by their IDs
   * Returns a Map of artistId -> artistObject for cached artists
   * and a list of artist IDs that need to be fetched
   *
   * Uses batch read for performance - single transaction instead of N reads
   */
  async getCachedArtists(artistIds: string[]): Promise<CachedArtistsResult> {
    await this._ensureInit();

    const cachedArtists: ArtistMap = new Map();
    const uncachedIds: string[] = [];

    // Batch read all artists in a single transaction
    const cachedEntries = await this._cacheService.getMany<ArtistCacheEntry>(
      STORES.ARTISTS,
      artistIds
    );

    // Process results and check expiration
    for (const artistId of artistIds) {
      const cached = cachedEntries.get(artistId);

      if (
        cached &&
        !this._cacheService.isExpired(cached.cachedAt, ARTIST_CACHE_TTL)
      ) {
        cachedArtists.set(artistId, cached.artist);
      } else {
        uncachedIds.push(artistId);
      }
    }

    return { cachedArtists, uncachedIds };
  }

  /**
   * Cache artists
   * Accepts an array of artist objects with 'id' property
   */
  async cacheArtists(artists: SpotifyArtist[]): Promise<boolean> {
    await this._ensureInit();

    const results = await Promise.all(
      artists.map((artist) =>
        this._cacheService.set<ArtistCacheEntry>(STORES.ARTISTS, artist.id, {
          artist,
          cachedAt: Date.now(),
        })
      )
    );

    return results.every((r) => r);
  }

  /**
   * Get list of artist IDs that aren't cached or have expired
   */
  async getUncachedArtistIds(artistIds: string[]): Promise<string[]> {
    const { uncachedIds } = await this.getCachedArtists(artistIds);
    return uncachedIds;
  }

  // ==================== CACHE MANAGEMENT ====================

  /**
   * Clear all cache data for a specific user
   * Clears tracks for the user but keeps artist cache (shared)
   */
  async invalidateUserCache(userId: string): Promise<boolean> {
    await this._ensureInit();
    return this.invalidateTrackCache(userId);
  }

  /**
   * Clear all cache data
   */
  async clearAllCaches(): Promise<boolean> {
    await this._ensureInit();
    await this._cacheService.clear(STORES.TRACKS);
    await this._cacheService.clear(STORES.ARTISTS);
    return true;
  }

  /**
   * Get cache statistics (for debugging)
   */
  async getStats(): Promise<CacheStats> {
    await this._ensureInit();

    const trackKeys = await this._cacheService.keys(STORES.TRACKS);
    const artistKeys = await this._cacheService.keys(STORES.ARTISTS);

    return {
      storageType: this._cacheService.getActiveStorageType(),
      trackCacheCount: trackKeys.length,
      artistCacheCount: artistKeys.length,
      trackTTL: TRACK_CACHE_TTL,
      artistTTL: ARTIST_CACHE_TTL,
    };
  }
}

// Singleton instance
let spotifyCacheInstance: SpotifyCache | null = null;

/**
 * Get the singleton SpotifyCache instance
 */
export function getSpotifyCache(): SpotifyCache {
  if (!spotifyCacheInstance) {
    spotifyCacheInstance = new SpotifyCache();
  }
  return spotifyCacheInstance;
}

export { SpotifyCache };
