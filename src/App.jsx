import { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { exchangeCodeForToken, refreshAccessToken } from './auth';

const API_BASE = 'https://api.spotify.com/';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tracks, setTracks] = useState(null);
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

        const redirectUri = window.location.origin + window.location.pathname;
        const tokenData = await exchangeCodeForToken(code, codeVerifier, redirectUri);

        // Store tokens
        saveTokens(tokenData);

        // Clean up
        sessionStorage.removeItem('code_verifier');
        window.history.replaceState(null, '', window.location.pathname);

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

  async function loadTracks() {
    try {
      const allTracks = await loadCollection(`${API_BASE}v1/me/tracks?offset=0&limit=50`);
      setTracks(allTracks);
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
        throw { status: response.status, message: response.statusText };
      }

      const data = await response.json();
      if (data.items) {
        collection.push(...data.items);
      }
      nextUrl = data.next;
    }

    return collection;
  }

  function handleLogout() {
    clearTokens();
    setIsAuthenticated(false);
    setTracks(null);
    setError(null);
    window.location.href = window.location.origin;
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return (
      <div>
        <h1>Error</h1>
        <p>{error}</p>
        <button onClick={() => { setError(null); clearTokens(); }} className="btn btn--login">
          Try Again
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <Dashboard tracks={tracks} onLogout={handleLogout} />;
}

export default App;
