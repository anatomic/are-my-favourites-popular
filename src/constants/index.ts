/**
 * Application Constants
 *
 * Centralizes magic numbers and configuration values.
 * Import from here instead of hardcoding values throughout the codebase.
 */

// =============================================================================
// SPOTIFY API
// =============================================================================

export const SPOTIFY = {
  /** Maximum artists per batch request */
  BATCH_SIZE: 50,

  /** Default concurrency for parallel API requests */
  DEFAULT_CONCURRENCY: 3,

  /** Default volume (0-1) */
  DEFAULT_VOLUME: 0.5,
} as const;

// =============================================================================
// PLAYER
// =============================================================================

export const PLAYER = {
  /** Polling interval when music is playing (ms) */
  POLL_INTERVAL_PLAYING_MS: 1000,

  /** Polling interval when music is paused (ms) */
  POLL_INTERVAL_PAUSED_MS: 10000,

  /** Delay after API calls before refreshing state (ms) */
  STATE_REFRESH_DELAY_MS: 300,

  /** SDK poll interval when waiting for Spotify object (ms) */
  SDK_POLL_INTERVAL_MS: 50,

  /** Maximum time to wait for SDK to load (ms) */
  SDK_TIMEOUT_MS: 10000,

  /** Player name shown in Spotify */
  NAME: 'Are My Favourites Popular?',
} as const;

// =============================================================================
// RETRY / BACKOFF
// =============================================================================

export const RETRY = {
  /** Default number of retries for transient failures */
  DEFAULT_RETRIES: 5,

  /** Base delay for exponential backoff (ms) */
  BASE_DELAY_MS: 500,

  /** Backoff multiplier */
  BACKOFF_MULTIPLIER: 1.5,

  /** Delays for play retry attempts (ms) */
  PLAY_RETRY_DELAYS_MS: [1000, 2000, 3000] as readonly number[],

  /** Delay after playback transfer before retrying (ms) */
  TRANSFER_DELAY_MS: 500,

  /** Delay after reconnection before using device (ms) */
  RECONNECT_DELAY_MS: 2000,
} as const;

// =============================================================================
// AUTHENTICATION
// =============================================================================

export const AUTH = {
  /** Buffer before token expiry to trigger refresh (ms) */
  TOKEN_REFRESH_BUFFER_MS: 60 * 1000,

  /** Buffer to consider token as "expiring soon" (ms) */
  TOKEN_EXPIRING_SOON_BUFFER_MS: 5 * 60 * 1000,
} as const;

// =============================================================================
// RATE LIMITING
// =============================================================================

export const RATE_LIMIT = {
  /** Maximum retries for rate-limited requests */
  MAX_RETRIES: 3,

  /** Default Retry-After value if header missing (seconds) */
  DEFAULT_RETRY_AFTER_S: 1,

  /** Minimum delay between retries (ms) */
  MIN_RETRY_DELAY_MS: 100,

  /** Maximum delay between retries (ms) */
  MAX_RETRY_DELAY_MS: 60000,

  /** Jitter factor for retry delays (0-1) */
  JITTER_FACTOR: 0.1,
} as const;
