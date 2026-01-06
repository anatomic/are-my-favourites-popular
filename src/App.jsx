import { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

const API_BASE = 'https://api.spotify.com/';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tracks, setTracks] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle OAuth callback
    if (window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get('access_token');
      const expiresIn = params.get('expires_in');
      const error = params.get('error');

      if (error) {
        console.error('OAuth error:', error);
      } else if (accessToken) {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('expires_at', Date.now() + (parseInt(expiresIn) * 1000));
        // Clear the hash from URL
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    // Check if we have a valid token
    const token = localStorage.getItem('access_token');
    const expiresAt = localStorage.getItem('expires_at');

    if (token && expiresAt && parseInt(expiresAt) > Date.now()) {
      setIsAuthenticated(true);
      loadTracks();
    } else {
      localStorage.clear();
      setLoading(false);
    }
  }, []);

  async function loadTracks() {
    try {
      const allTracks = await loadCollection(`${API_BASE}v1/me/tracks?offset=0&limit=50`);
      setTracks(allTracks);
    } catch (err) {
      console.error('Failed to load tracks:', err);
      if (err.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadCollection(url) {
    const collection = [];
    let nextUrl = url;

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
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
    localStorage.clear();
    setIsAuthenticated(false);
    setTracks(null);
    window.location.href = window.location.origin;
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <Dashboard tracks={tracks} onLogout={handleLogout} />;
}

export default App;
