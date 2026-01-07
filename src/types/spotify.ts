/**
 * Spotify API Type Definitions
 * Based on Spotify Web API Reference: https://developer.spotify.com/documentation/web-api
 */

// ============ Core Entities ============

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyExternalUrls {
  spotify: string;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  uri: string;
  href: string;
  external_urls: SpotifyExternalUrls;
  genres?: string[];
  images?: SpotifyImage[];
  popularity?: number;
  followers?: {
    total: number;
  };
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  uri: string;
  href: string;
  album_type: 'album' | 'single' | 'compilation';
  release_date: string;
  release_date_precision: 'year' | 'month' | 'day';
  total_tracks: number;
  images: SpotifyImage[];
  artists: SpotifyArtist[];
  external_urls: SpotifyExternalUrls;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  href: string;
  duration_ms: number;
  popularity: number;
  explicit: boolean;
  track_number: number;
  disc_number: number;
  preview_url: string | null;
  album: SpotifyAlbum;
  artists: SpotifyArtist[];
  external_urls: SpotifyExternalUrls;
  is_local: boolean;
}

export interface SavedTrack {
  added_at: string;
  track: SpotifyTrack;
}

// ============ API Responses ============

export interface SpotifyPaginatedResponse<T> {
  href: string;
  items: T[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

export interface SpotifyArtistsResponse {
  artists: (SpotifyArtist | null)[];
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string | null;
  email?: string;
  uri: string;
  href: string;
  external_urls: SpotifyExternalUrls;
  images: SpotifyImage[];
  product?: 'free' | 'open' | 'premium';
  country?: string;
  followers: {
    total: number;
  };
}

// ============ Authentication ============

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface SpotifyAuthError {
  error: string;
  error_description?: string;
}

// ============ Web Playback SDK ============

export interface SpotifyDevice {
  id: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number;
}

export interface SpotifyDevicesResponse {
  devices: SpotifyDevice[];
}

export interface SpotifyPlaybackState {
  device: SpotifyDevice;
  shuffle_state: boolean;
  repeat_state: 'off' | 'track' | 'context';
  timestamp: number;
  context: {
    uri: string;
    href: string;
    external_urls: SpotifyExternalUrls;
    type: string;
  } | null;
  progress_ms: number;
  is_playing: boolean;
  item: SpotifyTrack | null;
  currently_playing_type: 'track' | 'episode' | 'ad' | 'unknown';
}

// Spotify Web Playback SDK types
export interface WebPlaybackError {
  message: string;
}

export interface WebPlaybackReady {
  device_id: string;
}

export interface WebPlaybackPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  // Event listener overloads for type safety
  addListener(
    event: 'initialization_error',
    callback: (error: WebPlaybackError) => void
  ): void;
  addListener(
    event: 'authentication_error',
    callback: (error: WebPlaybackError) => void
  ): void;
  addListener(
    event: 'account_error',
    callback: (error: WebPlaybackError) => void
  ): void;
  addListener(
    event: 'playback_error',
    callback: (error: WebPlaybackError) => void
  ): void;
  addListener(event: 'autoplay_failed', callback: () => void): void;
  addListener(event: 'ready', callback: (data: WebPlaybackReady) => void): void;
  addListener(
    event: 'not_ready',
    callback: (data: WebPlaybackReady) => void
  ): void;
  addListener(
    event: 'player_state_changed',
    callback: (state: WebPlaybackState | null) => void
  ): void;
  addListener(event: string, callback: (data: unknown) => void): void;
  removeListener(event: string, callback?: (data: unknown) => void): void;
  getCurrentState(): Promise<WebPlaybackState | null>;
  setName(name: string): Promise<void>;
  getVolume(): Promise<number>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
  activateElement(): Promise<void>;
}

export interface WebPlaybackState {
  context: {
    uri: string;
    metadata: Record<string, unknown>;
  };
  disallows: {
    pausing: boolean;
    peeking_next: boolean;
    peeking_prev: boolean;
    resuming: boolean;
    seeking: boolean;
    skipping_next: boolean;
    skipping_prev: boolean;
  };
  paused: boolean;
  position: number;
  repeat_mode: number;
  shuffle: boolean;
  track_window: {
    current_track: WebPlaybackTrack;
    previous_tracks: WebPlaybackTrack[];
    next_tracks: WebPlaybackTrack[];
  };
}

export interface WebPlaybackTrack {
  uri: string;
  id: string;
  type: 'track' | 'episode' | 'ad';
  media_type: 'audio' | 'video';
  name: string;
  is_playable: boolean;
  album: {
    uri: string;
    name: string;
    images: SpotifyImage[];
  };
  artists: Array<{
    uri: string;
    name: string;
  }>;
}

// Global Spotify SDK type augmentation
declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (callback: (token: string) => void) => void;
        volume?: number;
        enableMediaSession?: boolean;
      }) => WebPlaybackPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
    spotifySDKReady?: boolean;
  }

  // Vite-injected CLIENT_ID
  const CLIENT_ID: string;
}

// ============ Application Types ============

export type ArtistMap = Map<string, SpotifyArtist>;

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

export interface TrackCacheEntry {
  userId: string;
  items: SavedTrack[];
  cachedAt: number;
}

export interface ArtistCacheEntry {
  artist: SpotifyArtist;
  cachedAt: number;
}

// ============ Component Props ============

export interface DashboardProps {
  tracks: SavedTrack[] | null;
  artistMap: ArtistMap | null;
  onLogout: () => void;
  getAccessToken: () => Promise<string>;
}

export interface StatsProps {
  tracks: SavedTrack[];
  artistMap: ArtistMap | null;
  onPlayTrack?: (track: SpotifyTrack) => void;
}

export interface PlayerProps {
  isReady: boolean;
  isPremium: boolean | null;
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  error: string | null;
  currentDevice: SpotifyDevice | null;
  onTogglePlay: () => void;
  onSeek: (positionMs: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onVolumeChange: (volume: number) => void;
}

// ============ Hook Return Types ============

export interface UseSpotifyPlayerReturn {
  isReady: boolean;
  isPremium: boolean | null;
  deviceId: string | null;
  localPlayerState: WebPlaybackState | null;
  externalPlayerState: SpotifyPlaybackState | null;
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  error: string | null;
  isPlayingLocally: boolean;
  currentDevice: SpotifyDevice | null;
  play: (trackUri: string, positionMs?: number) => Promise<boolean>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  getVolume: () => Promise<number>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
}
