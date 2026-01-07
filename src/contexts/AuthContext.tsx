/**
 * Authentication Context
 *
 * Provides authentication state and methods throughout the app.
 * Handles OAuth callback, token management, and session restoration.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { exchangeCodeForToken } from '../auth';
import { loggers } from '../utils/logger';
import {
  saveTokens,
  clearTokens,
  getValidAccessToken,
  initializeAuth,
  getCachedUserId,
  cacheUserId,
} from '../services/tokenService';
import { fetchUserProfile } from '../services/spotifyApi';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  userId: string | null;
}

interface AuthContextValue extends AuthState {
  login: () => void;
  logout: () => Promise<void>;
  clearError: () => void;
  getAccessToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  onLogout?: () => Promise<void>;
}

export function AuthProvider({ children, onLogout }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    error: null,
    userId: null,
  });

  // Handle OAuth callback and session restoration
  useEffect(() => {
    async function fetchAndCacheUserId(): Promise<string> {
      // Check cache first
      const cachedId = getCachedUserId();
      if (cachedId) {
        return cachedId;
      }

      // Fetch from API
      const profile = await fetchUserProfile();
      cacheUserId(profile.id);
      return profile.id;
    }

    async function handleAuth(): Promise<void> {
      try {
        // Check for authorization code in URL (PKCE callback)
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const authError = params.get('error');

        if (authError) {
          setState((prev) => ({
            ...prev,
            error: `Authorization failed: ${authError}`,
            isLoading: false,
          }));
          return;
        }

        if (code) {
          // Exchange authorization code for tokens
          const codeVerifier = sessionStorage.getItem('code_verifier');
          if (!codeVerifier) {
            setState((prev) => ({
              ...prev,
              error: 'Missing code verifier. Please try logging in again.',
              isLoading: false,
            }));
            return;
          }

          // Clear URL immediately to prevent double-execution in React StrictMode
          const redirectUri = window.location.origin + window.location.pathname;
          window.history.replaceState(null, '', window.location.pathname);
          sessionStorage.removeItem('code_verifier');

          const tokenData = await exchangeCodeForToken(
            code,
            codeVerifier,
            redirectUri
          );
          saveTokens(tokenData);

          // Fetch and cache user ID
          const userId = await fetchAndCacheUserId();

          setState({
            isAuthenticated: true,
            isLoading: false,
            error: null,
            userId,
          });
          return;
        }

        // Try to restore session from stored tokens
        const authRestored = await initializeAuth();
        if (authRestored) {
          const userId = await fetchAndCacheUserId();
          setState({
            isAuthenticated: true,
            isLoading: false,
            error: null,
            userId,
          });
          return;
        }

        // No valid auth
        setState((prev) => ({
          ...prev,
          isLoading: false,
        }));
      } catch (err) {
        loggers.auth.error('Auth error:', err);
        const error = err as Error;
        clearTokens();
        setState({
          isAuthenticated: false,
          isLoading: false,
          error: error.message,
          userId: null,
        });
      }
    }

    handleAuth();
  }, []);

  const login = useCallback(() => {
    // Login is handled by the Login component redirecting to Spotify
    // This is a placeholder for any pre-login logic
  }, []);

  const logout = useCallback(async () => {
    // Call optional cleanup callback (e.g., clear caches)
    if (onLogout) {
      await onLogout();
    }

    clearTokens();
    setState({
      isAuthenticated: false,
      isLoading: false,
      error: null,
      userId: null,
    });

    // Redirect to home
    window.location.href = window.location.origin;
  }, [onLogout]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
    clearTokens();
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    clearError,
    getAccessToken: getValidAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
