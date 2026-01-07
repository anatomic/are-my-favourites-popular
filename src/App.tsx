import { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { exchangeCodeForToken } from './auth';
import { getSpotifyCache } from './cache';
import { SPOTIFY_API_BASE } from './config';
import {
  saveTokens,
  clearTokens,
  getValidAccessToken,
  initializeAuth,
  getCachedUserId,
  cacheUserId,
} from './services/tokenService';
import type { SavedTrack, SpotifyArtist, ArtistMap, SpotifyUserProfile } from './types/spotify';

const spotifyCache = getSpotifyCache();

interface ApiError extends Error {
  status?: number;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [tracks, setTracks] = useState<SavedTrack[] | null>(null);
  const [artistMap, setArtistMap] = useState<ArtistMap | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleAuth();
  }, []);

  async function handleAuth(): Promise<void> {
    try {
      // Check for authorization code in URL (PKCE callback)
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const authError = params.get('error');

      if (authError) {
        setError(`Authorization failed: ${authError}`);
        setLoading(false);
        return;
      }

      if (code) {
        // Exchange authorization code for tokens
        const codeVerifier = sessionStorage.getItem('code_verifier');
        if (!codeVerifier) {
          setError('Missing code verifier. Please try logging in again.');
          setLoading(false);
          return;
        }

        // Clear URL immediately to prevent double-execution in React StrictMode
        // (Spotify auth codes are single-use)
        const redirectUri = window.location.origin + window.location.pathname;
        window.history.replaceState(null, '', window.location.pathname);
        sessionStorage.removeItem('code_verifier');

        const tokenData = await exchangeCodeForToken(code, codeVerifier, redirectUri);

        // Store tokens securely (access token in sessionStorage, refresh in localStorage)
        saveTokens(tokenData);

        setIsAuthenticated(true);
        await loadTracks();
        return;
      }

      // Try to initialize auth from stored tokens (handles refresh automatically)
      const authRestored = await initializeAuth();
      if (authRestored) {
        setIsAuthenticated(true);
        await loadTracks();
        return;
      }

      // No valid auth, show login
      setLoading(false);
    } catch (err) {
      console.error('Auth error:', err);
      const error = err as Error;
      setError(error.message);
      clearTokens();
      setLoading(false);
    }
  }

  async function getUserId(): Promise<string> {
    // Check if we have cached user ID
    const cachedId = getCachedUserId();
    if (cachedId) {
      return cachedId;
    }

    // Fetch user ID from Spotify API
    const accessToken = await getValidAccessToken();
    const response = await fetch(`${SPOTIFY_API_BASE}v1/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error: ApiError = new Error(`Failed to fetch user profile: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const userData: SpotifyUserProfile = await response.json();
    const userId = userData.id;

    // Cache the user ID
    cacheUserId(userId);
    return userId;
  }

  async function loadTracks(): Promise<void> {
    try {
      // Initialize cache
      await spotifyCache.init();

      // Get user ID for cache scoping
      const userId = await getUserId();

      // Check if we have valid cached tracks
      const cachedTracks = await spotifyCache.getCachedTracks(userId);
      if (cachedTracks) {
        setTracks(cachedTracks);

        // Load artists (also uses caching)
        const artists = await loadArtistGenres(cachedTracks);
        setArtistMap(artists);
        return;
      }

      // No valid cache, fetch from API
      const allTracks = await loadCollection(`${SPOTIFY_API_BASE}v1/me/tracks?offset=0&limit=50`);
      setTracks(allTracks);

      // Cache the tracks
      await spotifyCache.cacheTracks(userId, allTracks);

      // Fetch artist data for genre information
      const artists = await loadArtistGenres(allTracks);
      setArtistMap(artists);
    } catch (err) {
      console.error('Failed to load tracks:', err);
      const error = err as ApiError;
      if (error.status === 401) {
        handleLogout();
      } else {
        setError('Failed to load tracks. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadArtistGenres(tracks: SavedTrack[]): Promise<ArtistMap> {
    // Extract unique artist IDs
    const artistIds = [...new Set(
      tracks.flatMap(t => t.track.artists.map(a => a.id))
    )];

    // Check which artists are already cached
    const { cachedArtists, uncachedIds } = await spotifyCache.getCachedArtists(artistIds);

    // Start with cached artists
    const artistData: ArtistMap = new Map(cachedArtists);

    // Only fetch uncached artists from API
    if (uncachedIds.length > 0) {
      const fetchedArtists: SpotifyArtist[] = [];

      // Fetch in batches of 50 (Spotify API limit)
      for (let i = 0; i < uncachedIds.length; i += 50) {
        const batch = uncachedIds.slice(i, i + 50);
        const accessToken = await getValidAccessToken();
        const response = await fetch(
          `${SPOTIFY_API_BASE}v1/artists?ids=${batch.join(',')}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data: { artists: (SpotifyArtist | null)[] } = await response.json();
          data.artists.forEach(a => {
            if (a) {
              artistData.set(a.id, a);
              fetchedArtists.push(a);
            }
          });
        }
      }

      // Cache the newly fetched artists
      if (fetchedArtists.length > 0) {
        await spotifyCache.cacheArtists(fetchedArtists);
      }
    }

    return artistData;
  }

  async function loadCollection(url: string): Promise<SavedTrack[]> {
    const collection: SavedTrack[] = [];
    let nextUrl: string | null = url;

    while (nextUrl) {
      const accessToken = await getValidAccessToken();
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error: ApiError = new Error(`Request failed with status ${response.status}: ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      const data: { items: SavedTrack[]; next: string | null } = await response.json();
      if (data.items) {
        collection.push(...data.items);
      }
      nextUrl = data.next;
    }

    return collection;
  }

  async function handleLogout(): Promise<void> {
    // Clear user's track cache (keep artist cache - shared across users)
    const userId = getCachedUserId();
    if (userId) {
      try {
        await spotifyCache.invalidateUserCache(userId);
      } catch (err) {
        console.warn('Failed to invalidate user cache during logout:', err);
      }
    } else {
      // No userId found - clear all track caches to be safe
      try {
        await spotifyCache.clearAllCaches();
      } catch (err) {
        console.warn('Failed to clear caches during logout:', err);
      }
    }

    clearTokens();
    setIsAuthenticated(false);
    setTracks(null);
    setArtistMap(null);
    setError(null);
    window.location.href = window.location.origin;
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Connecting to Spotify...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <h1>Something went wrong</h1>
        <p>{error}</p>
        <button onClick={() => { setError(null); clearTokens(); }} className="btn btn--primary">
          Try Again
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <Dashboard tracks={tracks} artistMap={artistMap} onLogout={handleLogout} getAccessToken={getValidAccessToken} />;
}

export default App;
