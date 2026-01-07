/**
 * Cache configuration constants
 * Adjust TTLs here to control how often data is refreshed from the Spotify API
 */

export const CACHE_CONFIG = {
  // Time-to-live values (in milliseconds)
  TRACK_CACHE_TTL: 10 * 60 * 1000, // 10 minutes - adjust as needed
  ARTIST_CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hours - artist metadata rarely changes

  // Storage configuration
  MAX_LOCALSTORAGE_SIZE: 2 * 1024 * 1024, // 2MB conservative threshold before falling back
  INDEXEDDB_NAME: 'spotify-favorites-cache',
  INDEXEDDB_VERSION: 1,

  // Store names
  STORES: {
    TRACKS: 'tracks',
    ARTISTS: 'artists',
  },

  // localStorage keys (prefixed to avoid conflicts)
  LOCALSTORAGE_PREFIX: 'sfc_', // spotify-favorites-cache
} as const;

export type StoreNames = (typeof CACHE_CONFIG.STORES)[keyof typeof CACHE_CONFIG.STORES];
