/**
 * App Component
 *
 * Root component that orchestrates authentication and data loading.
 * Uses AuthContext for auth state and useSpotifyData for track/artist data.
 */

import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  useSpotifyData,
  clearUserCache,
  clearAllCaches,
} from './hooks/useSpotifyData';
import {
  ErrorBoundary,
  SectionErrorBoundary,
} from './components/ErrorBoundary';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function AppContent() {
  const {
    isAuthenticated,
    isLoading: authLoading,
    error: authError,
    userId,
    logout,
    clearError,
    getAccessToken,
  } = useAuth();

  const {
    tracks,
    artistMap,
    isLoading: dataLoading,
    error: dataError,
  } = useSpotifyData(userId, isAuthenticated, logout);

  // Handle logout with cache cleanup
  async function handleLogout(): Promise<void> {
    if (userId) {
      await clearUserCache(userId);
    } else {
      await clearAllCaches();
    }
    await logout();
  }

  // Show loading state
  if (authLoading || (isAuthenticated && dataLoading && !tracks)) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Connecting to Spotify...</p>
      </div>
    );
  }

  // Show auth error
  if (authError) {
    return (
      <div className="error">
        <h1>Something went wrong</h1>
        <p>{authError}</p>
        <button onClick={clearError} className="btn btn--primary">
          Try Again
        </button>
      </div>
    );
  }

  // Show data error
  if (dataError) {
    return (
      <div className="error">
        <h1>Something went wrong</h1>
        <p>{dataError}</p>
        <button
          onClick={() => window.location.reload()}
          className="btn btn--primary"
        >
          Refresh
        </button>
      </div>
    );
  }

  // Show login
  if (!isAuthenticated) {
    return <Login />;
  }

  // Show dashboard with error boundary
  return (
    <SectionErrorBoundary section="Dashboard">
      <Dashboard
        tracks={tracks}
        artistMap={artistMap}
        onLogout={handleLogout}
        getAccessToken={getAccessToken}
      />
    </SectionErrorBoundary>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
