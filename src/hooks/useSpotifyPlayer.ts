import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  SpotifyTrack,
  SpotifyDevice,
  SpotifyPlaybackState,
  WebPlaybackState,
  WebPlaybackPlayer,
  UseSpotifyPlayerReturn,
  SpotifyDevicesResponse,
} from '../types/spotify';

// Smart polling intervals - poll more frequently when playing
const POLL_INTERVAL_PLAYING = 1000;  // 1 second when music is playing
const POLL_INTERVAL_PAUSED = 10000;  // 10 seconds when paused/idle
const PLAYER_NAME = 'Are My Favourites Popular?';

// Singleton guard to prevent React StrictMode from creating multiple players
let playerInstance: WebPlaybackPlayer | null = null;
let playerDeviceId: string | null = null;

/**
 * Custom hook to manage Spotify Web Playback SDK + external device monitoring
 * Shows playback from any device, but chart clicks play on the web player
 *
 * IMPORTANT: Due to a known Spotify bug (Nov 2024), the device_id from the SDK's
 * `ready` event does NOT match the ID in the /v1/me/player/devices API.
 * We resolve the correct device ID by querying the API and matching by device name.
 *
 * @param getAccessToken - Async function that returns a valid access token
 * @returns Player state and control methods
 */
export function useSpotifyPlayer(getAccessToken: () => Promise<string>): UseSpotifyPlayerReturn {
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isPremium, setIsPremium] = useState<boolean | null>(null); // null = unknown, true/false = determined
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [localPlayerState, setLocalPlayerState] = useState<WebPlaybackState | null>(null);
  const [externalPlayerState, setExternalPlayerState] = useState<SpotifyPlaybackState | null>(null);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<WebPlaybackPlayer | null>(null);
  const tokenRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const activatedRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  // Helper to make API requests with fresh token
  const makeApiRequest = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    try {
      const token = await getAccessToken();
      tokenRef.current = token;

      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
      });

      return response;
    } catch (err) {
      console.error('API request failed:', err);
      throw err;
    }
  }, [getAccessToken]);

  // Fetch current playback state from any device
  const fetchExternalPlaybackState = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;

    try {
      const response = await makeApiRequest('https://api.spotify.com/v1/me/player');

      if (response.status === 204) {
        // No active playback
        setExternalPlayerState(null);
        setActiveDeviceId(null);
        return;
      }

      if (response.ok) {
        const data: SpotifyPlaybackState = await response.json();
        setExternalPlayerState(data);
        setActiveDeviceId(data.device?.id || null);

        // If we got a response, user has Premium
        if (isPremium === null) {
          setIsPremium(true);
        }
      }
    } catch (err) {
      console.error('Error fetching playback state:', err);
    }
  }, [makeApiRequest, isPremium]);

  // Initialize the player when SDK is ready
  useEffect(() => {
    if (!getAccessToken) return;

    mountedRef.current = true;

    const initializePlayer = async (): Promise<void> => {
      // Check if SDK is loaded
      if (!window.Spotify) {
        // Check if SDK callback already fired (race condition)
        if (window.spotifySDKReady) {
          // SDK loaded but Spotify object not yet available - poll for it
          const checkSpotify = setInterval(() => {
            if (window.Spotify) {
              clearInterval(checkSpotify);
              if (mountedRef.current) initializePlayer();
            }
          }, 50);
          // Cleanup interval on unmount
          setTimeout(() => clearInterval(checkSpotify), 10000); // Give up after 10s
          return;
        }

        // SDK not loaded yet, set up callback
        const existingCallback = window.onSpotifyWebPlaybackSDKReady;
        window.onSpotifyWebPlaybackSDKReady = () => {
          if (existingCallback) existingCallback();
          if (mountedRef.current) initializePlayer();
        };
        return;
      }

      try {
        // Check if we already have a player instance (singleton guard)
        // This prevents React StrictMode from creating duplicate players
        if (playerInstance) {
          console.log('Reusing existing player instance');
          playerRef.current = playerInstance;

          // If we have a cached device ID, restore state
          if (playerDeviceId) {
            setDeviceId(playerDeviceId);
            setIsReady(true);
            setIsPremium(true);
          }
          return;
        }

        // Get initial token
        const token = await getAccessToken();
        tokenRef.current = token;

        const player = new window.Spotify.Player({
          name: PLAYER_NAME,
          getOAuthToken: async (cb) => {
            const freshToken = await getAccessToken();
            tokenRef.current = freshToken;
            cb(freshToken);
          },
          volume: 0.5,
          enableMediaSession: true, // Enable OS media controls
        });

        // IMPORTANT: Add ALL event listeners BEFORE calling connect()
        // This prevents missing events due to race conditions

        // Error handling
        player.addListener('initialization_error', ({ message }) => {
          console.error('Spotify Player initialization error:', message);
          if (mountedRef.current) setError(`Initialization error: ${message}`);
        });

        player.addListener('authentication_error', ({ message }) => {
          console.error('Spotify Player authentication error:', message);
          if (mountedRef.current) setError(`Authentication error: ${message}`);
        });

        player.addListener('account_error', ({ message }) => {
          console.error('Spotify Player account error:', message);
          if (mountedRef.current) {
            setIsPremium(false);
            setError('Spotify Premium is required for playback');
          }
        });

        player.addListener('playback_error', ({ message }) => {
          console.error('Spotify Player playback error:', message);
          if (mountedRef.current) setError(`Playback error: ${message}`);
        });

        // Handle autoplay blocked by browser
        player.addListener('autoplay_failed', () => {
          console.warn('Autoplay blocked by browser');
          if (mountedRef.current) {
            setError('Click play to start - autoplay blocked by browser');
          }
        });

        // Ready/not ready
        player.addListener('ready', async ({ device_id: sdkDeviceId }) => {
          console.log('SDK ready event - device_id:', sdkDeviceId);

          if (!mountedRef.current) return;

          setIsPremium(true);
          setError(null);

          // Due to known Spotify bug, SDK device_id may not match API device_id
          // Poll the API to find our device by name and get the correct ID
          const resolveDeviceId = async (retries = 5, delay = 500): Promise<string | null> => {
            for (let attempt = 0; attempt < retries; attempt++) {
              if (!mountedRef.current) return null;

              try {
                const freshToken = await getAccessToken();
                const resp = await fetch('https://api.spotify.com/v1/me/player/devices', {
                  headers: { Authorization: `Bearer ${freshToken}` }
                });

                if (resp.ok) {
                  const { devices }: SpotifyDevicesResponse = await resp.json();
                  const ourDevice = devices.find((d: SpotifyDevice) => d.name === PLAYER_NAME);

                  if (ourDevice) {
                    if (ourDevice.id !== sdkDeviceId) {
                      console.log('Device ID resolved via API (SDK mismatch fixed)');
                    }
                    return ourDevice.id;
                  }
                }
              } catch (e) {
                const err = e as Error;
                console.warn('Device lookup attempt failed:', err.message);
              }

              // Wait before retry with exponential backoff
              if (attempt < retries - 1) {
                await new Promise(r => setTimeout(r, delay * Math.pow(1.5, attempt)));
              }
            }

            // Fallback to SDK device_id if API lookup fails
            console.warn('Could not resolve device via API, using SDK device_id');
            return sdkDeviceId;
          };

          // Resolve the correct device ID
          const correctDeviceId = await resolveDeviceId();

          if (mountedRef.current && correctDeviceId) {
            playerDeviceId = correctDeviceId;
            setDeviceId(correctDeviceId);
            setIsReady(true);
            console.log('Player ready with device ID:', correctDeviceId);
          }
        });

        player.addListener('not_ready', ({ device_id }) => {
          console.log('Player device offline:', device_id);
          if (mountedRef.current) {
            setIsReady(false);
            setDeviceId(null);
            playerDeviceId = null; // Clear cached device ID
          }
        });

        // Local player state changes (when playing on this web player)
        player.addListener('player_state_changed', (state) => {
          if (mountedRef.current) {
            setLocalPlayerState(state);
          }
        });

        // NOW connect (after all listeners are set up)
        const success = await player.connect();
        if (success) {
          console.log('Successfully connected to Spotify');
          playerRef.current = player;
          playerInstance = player; // Store as singleton

          // Start polling for external playback state
          fetchExternalPlaybackState();
        } else {
          console.error('Failed to connect to Spotify');
          if (mountedRef.current) setError('Failed to connect to Spotify');
        }
      } catch (err) {
        console.error('Error initializing Spotify player:', err);
        const error = err as Error;
        if (mountedRef.current) setError(error.message);
      }
    };

    // Initialize - if SDK is ready it will run, otherwise it sets up a callback
    initializePlayer();

    return () => {
      mountedRef.current = false;
      // Don't disconnect the singleton player - it persists across React remounts
      // This is intentional to prevent StrictMode from breaking playback
      playerRef.current = null;
    };
  }, [getAccessToken, fetchExternalPlaybackState]);

  // Smart polling for external playback state
  // - Polls every 1s when playing, every 10s when paused
  // - Stops polling when tab is hidden (Page Visibility API)
  useEffect(() => {
    if (!isReady) return;

    const isCurrentlyPlaying = externalPlayerState?.is_playing ?? false;

    // Function to start/restart polling with appropriate interval
    const startPolling = (): void => {
      // Clear existing interval
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      // Don't poll if tab is hidden
      if (document.hidden) return;

      // Use smart interval based on playback state
      const interval = isCurrentlyPlaying ? POLL_INTERVAL_PLAYING : POLL_INTERVAL_PAUSED;
      pollIntervalRef.current = window.setInterval(fetchExternalPlaybackState, interval);
    };

    // Handle visibility change
    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        // Tab hidden - stop polling to save resources
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } else {
        // Tab visible - fetch immediately and resume polling
        fetchExternalPlaybackState();
        startPolling();
      }
    };

    // Initial fetch
    fetchExternalPlaybackState();

    // Start polling
    startPolling();

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchExternalPlaybackState, isReady, externalPlayerState?.is_playing]);

  // Determine if playback is on our web player
  const isPlayingLocally = Boolean(deviceId && activeDeviceId === deviceId);

  // Activate the SDK player element (required for browser autoplay policies)
  const activatePlayer = useCallback(async (): Promise<void> => {
    if (activatedRef.current || !playerRef.current) return;

    try {
      await playerRef.current.activateElement();
      activatedRef.current = true;
      console.log('Player element activated');
    } catch (err) {
      console.log('Could not activate player element:', err);
    }
  }, []);

  // Retry play with increasing delays - handles cold start of web player
  const retryPlay = useCallback(async (trackUri: string, positionMs: number, targetDeviceId: string): Promise<boolean> => {
    const delays = [1000, 2000, 3000]; // Increasing delays between retries

    for (let attempt = 0; attempt < delays.length; attempt++) {
      // Wait before retry
      await new Promise(r => setTimeout(r, delays[attempt]));

      const response = await makeApiRequest(
        `https://api.spotify.com/v1/me/player/play?device_id=${targetDeviceId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uris: [trackUri],
            position_ms: positionMs,
          }),
        }
      );

      if (response.ok || response.status === 204) {
        return true;
      }
    }

    return false;
  }, [makeApiRequest]);

  // Play a specific track (always plays on web player, taking over playback)
  const play = useCallback(async (trackUri: string, positionMs = 0): Promise<boolean> => {
    // Clear previous errors on attempt
    setError(null);

    if (!deviceId) {
      console.error('Player not ready, deviceId:', deviceId);
      setError('Player not ready');
      return false;
    }

    try {
      // Ensure player element is activated (browser autoplay policy)
      await activatePlayer();

      // Resolve the device ID to use - may need correction due to Spotify bug
      let targetDeviceId = deviceId;

      const devicesResponse = await makeApiRequest('https://api.spotify.com/v1/me/player/devices');
      if (devicesResponse.ok) {
        const { devices }: SpotifyDevicesResponse = await devicesResponse.json();
        const ourDevice = devices.find((d: SpotifyDevice) => d.id === deviceId);

        if (!ourDevice) {
          // Device not found by ID - try to find by name
          const byName = devices.find((d: SpotifyDevice) => d.name === PLAYER_NAME);
          if (byName) {
            console.log('Device ID corrected via name lookup');
            targetDeviceId = byName.id;
            setDeviceId(byName.id);
            playerDeviceId = byName.id;
          } else {
            // Device truly not found - try reconnecting
            if (playerRef.current) {
              playerRef.current.disconnect();
              const reconnected = await playerRef.current.connect();
              if (!reconnected) {
                setError('Player connection lost. Please refresh the page.');
                return false;
              }
              // Wait for ready event to resolve new device ID
              await new Promise(resolve => setTimeout(resolve, 2000));
              // Use the newly resolved device ID
              targetDeviceId = playerDeviceId || deviceId;
            }
          }
        }
      }

      // Try to play the track on the resolved device
      const response = await makeApiRequest(
        `https://api.spotify.com/v1/me/player/play?device_id=${targetDeviceId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uris: [trackUri],
            position_ms: positionMs,
          }),
        }
      );

      if (response.ok || response.status === 204) {
        setError(null);
        setTimeout(fetchExternalPlaybackState, 300);
        return true;
      }

      // If 404 or 403, device may not be active - transfer playback and retry
      if (response.status === 404 || response.status === 403) {
        console.log(`Got ${response.status}, transferring playback to our device...`);

        // Transfer playback to our device
        const transferResponse = await makeApiRequest(
          'https://api.spotify.com/v1/me/player',
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              device_ids: [targetDeviceId],
              play: false,
            }),
          }
        );

        if (transferResponse.ok || transferResponse.status === 204) {
          // Wait for transfer to complete
          await new Promise(r => setTimeout(r, 500));

          // Retry the play request
          const success = await retryPlay(trackUri, positionMs, targetDeviceId);

          if (success) {
            setError(null);
            setTimeout(fetchExternalPlaybackState, 300);
            return true;
          }
        }
      }

      // If we get here, playback failed
      const errorData = await response.json().catch(() => ({}));
      console.error('Playback failed:', errorData);
      setError('Failed to start playback');
      return false;
    } catch (err) {
      console.error('Error playing track:', err);
      setError('Error starting playback');
      return false;
    }
  }, [deviceId, makeApiRequest, fetchExternalPlaybackState, activatePlayer, retryPlay]);

  // Pause playback (works on any device)
  const pause = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      await makeApiRequest('https://api.spotify.com/v1/me/player/pause', {
        method: 'PUT',
      });
      setTimeout(fetchExternalPlaybackState, 300);
    } catch (err) {
      console.error('Error pausing:', err);
      setError('Failed to pause');
    }
  }, [makeApiRequest, fetchExternalPlaybackState]);

  // Resume playback (works on any device)
  const resume = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      await makeApiRequest('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
      });
      setTimeout(fetchExternalPlaybackState, 300);
    } catch (err) {
      console.error('Error resuming:', err);
      setError('Failed to resume');
    }
  }, [makeApiRequest, fetchExternalPlaybackState]);

  // Toggle play/pause (works on any device)
  const togglePlay = useCallback(async (): Promise<void> => {
    const isCurrentlyPlaying = externalPlayerState?.is_playing;
    if (isCurrentlyPlaying) {
      await pause();
    } else {
      await resume();
    }
  }, [externalPlayerState, pause, resume]);

  // Seek to position (works on any device)
  const seek = useCallback(async (positionMs: number): Promise<void> => {
    setError(null);

    try {
      await makeApiRequest(
        `https://api.spotify.com/v1/me/player/seek?position_ms=${Math.round(positionMs)}`,
        { method: 'PUT' }
      );
      setTimeout(fetchExternalPlaybackState, 300);
    } catch (err) {
      console.error('Error seeking:', err);
      setError('Failed to seek');
    }
  }, [makeApiRequest, fetchExternalPlaybackState]);

  // Set volume (works on any device)
  const setVolumeFunc = useCallback(async (volume: number): Promise<void> => {
    try {
      const volumePercent = Math.round(volume * 100);
      await makeApiRequest(
        `https://api.spotify.com/v1/me/player/volume?volume_percent=${volumePercent}`,
        { method: 'PUT' }
      );
    } catch (err) {
      console.error('Error setting volume:', err);
    }
  }, [makeApiRequest]);

  // Next track (works on any device)
  const nextTrack = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      await makeApiRequest('https://api.spotify.com/v1/me/player/next', {
        method: 'POST',
      });
      setTimeout(fetchExternalPlaybackState, 300);
    } catch (err) {
      console.error('Error skipping to next:', err);
      setError('Failed to skip');
    }
  }, [makeApiRequest, fetchExternalPlaybackState]);

  // Previous track (works on any device)
  const previousTrack = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      await makeApiRequest('https://api.spotify.com/v1/me/player/previous', {
        method: 'POST',
      });
      setTimeout(fetchExternalPlaybackState, 300);
    } catch (err) {
      console.error('Error skipping to previous:', err);
      setError('Failed to skip');
    }
  }, [makeApiRequest, fetchExternalPlaybackState]);

  // Get current volume
  const getVolume = useCallback(async (): Promise<number> => {
    return (externalPlayerState?.device?.volume_percent ?? 50) / 100;
  }, [externalPlayerState]);

  // Derive current state from external state (any device) or local state (web player)
  // External state is authoritative since it works for all devices
  const currentTrack: SpotifyTrack | null = externalPlayerState?.item || null;
  const isPlaying: boolean = externalPlayerState?.is_playing || false;
  const position: number = externalPlayerState?.progress_ms || 0;
  const duration: number = externalPlayerState?.item?.duration_ms || 0;
  const currentDevice: SpotifyDevice | null = externalPlayerState?.device || null;

  return {
    // State
    isReady,
    isPremium,
    deviceId,
    localPlayerState,
    externalPlayerState,
    currentTrack,
    isPlaying,
    position,
    duration,
    error,
    isPlayingLocally,
    currentDevice,

    // Methods
    play,
    pause,
    resume,
    togglePlay,
    seek,
    setVolume: setVolumeFunc,
    getVolume,
    nextTrack,
    previousTrack,
  };
}

export default useSpotifyPlayer;
