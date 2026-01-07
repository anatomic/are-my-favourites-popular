/**
 * Custom Error Classes
 *
 * Provides typed errors for better error handling and categorization.
 */

/**
 * Base error for Spotify API failures
 */
export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

/**
 * Error for rate-limited requests (HTTP 429)
 */
export class RateLimitError extends SpotifyApiError {
  constructor(
    public readonly retryAfterSeconds: number,
    message: string = 'Rate limited'
  ) {
    super(message, 429, true);
    this.name = 'RateLimitError';
  }
}

/**
 * Error for authentication failures
 */
export class AuthenticationError extends Error {
  public readonly status: number = 401;

  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error for premium account requirement
 */
export class PremiumRequiredError extends Error {
  constructor(
    message: string = 'Spotify Premium is required for this feature'
  ) {
    super(message);
    this.name = 'PremiumRequiredError';
  }
}

/**
 * Error for playback issues
 */
export class PlaybackError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean = true
  ) {
    super(message);
    this.name = 'PlaybackError';
  }
}

/**
 * Check if an error is a specific type
 */
export function isSpotifyApiError(error: unknown): error is SpotifyApiError {
  return error instanceof SpotifyApiError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function isAuthenticationError(
  error: unknown
): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}
