import { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { exchangeCodeForToken, refreshAccessToken } from './auth';
import { getSpotifyCache } from './cache';

const API_BASE = 'https://api.spotify.com/';
const spotifyCache = getSpotifyCache();

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tracks, setTracks] = useState(null);
  const [artistMap, setArtistMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    handleAuth();
  }, []);

  async function handleAuth() {
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

        // Store tokens
        saveTokens(tokenData);

        setIsAuthenticated(true);
        await loadTracks();
        return;
      }

      // Check for existing valid token
      const accessToken = localStorage.getItem('access_token');
      const expiresAt = localStorage.getItem('expires_at');
      const refreshToken = localStorage.getItem('refresh_token');

      if (accessToken && expiresAt) {
        // Check if token is expired or expiring soon (within 5 minutes)
        const isExpiringSoon = parseInt(expiresAt) < Date.now() + 5 * 60 * 1000;

        if (isExpiringSoon && refreshToken) {
          // Refresh the token
          try {
            const tokenData = await refreshAccessToken(refreshToken);
            saveTokens(tokenData);
          } catch {
            // Refresh failed, need to re-login
            clearTokens();
            setLoading(false);
            return;
          }
        } else if (isExpiringSoon) {
          // Token expired and no refresh token
          clearTokens();
          setLoading(false);
          return;
        }

        setIsAuthenticated(true);
        await loadTracks();
        return;
      }

      // No valid auth, show login
      setLoading(false);
    } catch (err) {
      console.error('Auth error:', err);
      setError(err.message);
      clearTokens();
      setLoading(false);
    }
  }

  function saveTokens(tokenData) {
    localStorage.setItem('access_token', tokenData.access_token);
    localStorage.setItem('expires_at', Date.now() + tokenData.expires_in * 1000);
    if (tokenData.refresh_token) {
      localStorage.setItem('refresh_token', tokenData.refresh_token);
    }
  }

  function clearTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('expires_at');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('spotify_user_id');
  }

  async function getValidAccessToken() {
    const expiresAt = localStorage.getItem('expires_at');
    const refreshToken = localStorage.getItem('refresh_token');

    // If token expires in less than 1 minute, refresh it
    if (parseInt(expiresAt) < Date.now() + 60 * 1000 && refreshToken) {
      const tokenData = await refreshAccessToken(refreshToken);
      saveTokens(tokenData);
      return tokenData.access_token;
    }

    return localStorage.getItem('access_token');
  }

  async function getUserId() {
    // Check if we have cached user ID
    const cachedUserId = localStorage.getItem('spotify_user_id');
    if (cachedUserId) {
      return cachedUserId;
    }

    // Fetch user ID from Spotify API
    const accessToken = await getValidAccessToken();
    const response = await fetch(`${API_BASE}v1/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user profile');
    }

    const userData = await response.json();
    const userId = userData.id;

    // Cache the user ID
    localStorage.setItem('spotify_user_id', userId);
    return userId;
  }

  async function loadTracks() {
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
      const allTracks = await loadCollection(`${API_BASE}v1/me/tracks?offset=0&limit=50`);
      setTracks(allTracks);

      // Cache the tracks
      await spotifyCache.cacheTracks(userId, allTracks);

      // Fetch artist data for genre information
      const artists = await loadArtistGenres(allTracks);
      setArtistMap(artists);
    } catch (err) {
      console.error('Failed to load tracks:', err);
      if (err.status === 401) {
        handleLogout();
      } else {
        setError('Failed to load tracks. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadArtistGenres(tracks) {
    // Extract unique artist IDs
    const artistIds = [...new Set(
      tracks.flatMap(t => t.track.artists.map(a => a.id))
    )];

    // Check which artists are already cached
    const { cachedArtists, uncachedIds } = await spotifyCache.getCachedArtists(artistIds);

    // Start with cached artists
    const artistData = new Map(cachedArtists);

    // Only fetch uncached artists from API
    if (uncachedIds.length > 0) {
      const fetchedArtists = [];

      // Fetch in batches of 50 (Spotify API limit)
      for (let i = 0; i < uncachedIds.length; i += 50) {
        const batch = uncachedIds.slice(i, i + 50);
        const accessToken = await getValidAccessToken();
        const response = await fetch(
          `${API_BASE}v1/artists?ids=${batch.join(',')}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
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

  async function loadCollection(url) {
    const collection = [];
    let nextUrl = url;

    while (nextUrl) {
      const accessToken = await getValidAccessToken();
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = new Error(`Request failed with status ${response.status}: ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      if (data.items) {
        collection.push(...data.items);
      }
      nextUrl = data.next;
    }

    return collection;
  }

  async function handleLogout() {
    // Clear user's track cache (keep artist cache - shared across users)
    const userId = localStorage.getItem('spotify_user_id');
    if (userId) {
      await spotifyCache.invalidateUserCache(userId);
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

  return <Dashboard tracks={tracks} artistMap={artistMap} onLogout={handleLogout} />;
}

export default App;
