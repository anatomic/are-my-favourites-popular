/**
 * Application Configuration
 *
 * Centralizes configuration and validates required environment variables.
 * Uses Vite's import.meta.env for environment variable access.
 */

// Spotify Client ID - required for OAuth
// In development, falls back to a default for convenience
// In production, VITE_SPOTIFY_CLIENT_ID must be set
const FALLBACK_CLIENT_ID = 'b644f355f49f4878bcdc373475838796';

export const SPOTIFY_CLIENT_ID: string =
  import.meta.env.VITE_SPOTIFY_CLIENT_ID || FALLBACK_CLIENT_ID;

// Validate configuration in production
// Note: This warning always shows in production since it's important
// to know if the fallback is being used. We use console.warn directly
// here because this runs at module load time, before the app (and any
// logging infrastructure) is fully initialized.
if (import.meta.env.PROD && !import.meta.env.VITE_SPOTIFY_CLIENT_ID) {
  console.warn(
    'VITE_SPOTIFY_CLIENT_ID is not set. Using fallback client ID. ' +
      'Set this environment variable in production.'
  );
}

// API configuration
export const SPOTIFY_API_BASE = 'https://api.spotify.com/';
export const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com';

// OAuth scopes required by the application
// Minimized to only what's actually used:
// - user-library-read: fetch saved tracks (core functionality)
// - streaming: Web Playback SDK for in-app player
// - user-read-playback-state: check current playback
// - user-modify-playback-state: play/pause/seek/volume control
export const SPOTIFY_SCOPES = [
  'user-library-read',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');
