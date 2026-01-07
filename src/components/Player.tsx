import type { ReactElement } from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { PlayerProps } from '../types/spotify';
import './player.css';

// Icons
function PlayIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function PrevIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  );
}

function NextIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  );
}

interface VolumeIconProps {
  level: number;
}

function VolumeIcon({ level }: VolumeIconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      {level === 0 ? (
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
      ) : level < 0.5 ? (
        <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
      ) : (
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      )}
    </svg>
  );
}

function formatTime(ms: number): string {
  if (!ms || ms < 0) return '0:00';
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function Player({
  isReady,
  isPremium,
  currentTrack,
  isPlaying,
  position,
  duration,
  error,
  currentDevice,
  onTogglePlay,
  onSeek,
  onPrevious,
  onNext,
  onVolumeChange,
}: PlayerProps): ReactElement {
  const [volume, setVolume] = useState<number>(0.5);
  const [localPosition, setLocalPosition] = useState<number>(position);
  const [isDraggingProgress, setIsDraggingProgress] = useState<boolean>(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState<boolean>(false);
  const [hasInitializedVolume, setHasInitializedVolume] =
    useState<boolean>(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  // Alias for animation logic
  const isDragging = isDraggingProgress;

  // Sync volume from Spotify on initial load
  useEffect(() => {
    if (!hasInitializedVolume && currentDevice?.volume_percent !== undefined) {
      setVolume(currentDevice.volume_percent / 100);
      setHasInitializedVolume(true);
    }
  }, [currentDevice?.volume_percent, hasInitializedVolume]);

  // Update local position when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalPosition(position);
    }
  }, [position, isDragging]);

  // Animate progress bar when playing
  useEffect(() => {
    if (isPlaying && !isDragging) {
      const startTime = Date.now();
      const startPosition = position;

      const animate = (): void => {
        const elapsed = Date.now() - startTime;
        setLocalPosition(Math.min(startPosition + elapsed, duration));
        animationRef.current = requestAnimationFrame(animate);
      };

      animationRef.current = requestAnimationFrame(animate);
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [isPlaying, position, duration, isDragging]);

  // Progress bar drag handlers
  const handleProgressMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      if (!progressRef.current || !duration) return;
      e.preventDefault();
      setIsDraggingProgress(true);

      const rect = progressRef.current.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const newPosition = Math.max(0, Math.min(percent * duration, duration));
      setLocalPosition(newPosition);
    },
    [duration]
  );

  useEffect(() => {
    if (!isDraggingProgress) return;

    const handleMouseMove = (e: MouseEvent): void => {
      if (!progressRef.current || !duration) return;
      const rect = progressRef.current.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const newPosition = Math.max(0, Math.min(percent * duration, duration));
      setLocalPosition(newPosition);
    };

    const handleMouseUp = (e: MouseEvent): void => {
      if (progressRef.current && duration) {
        const rect = progressRef.current.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const newPosition = Math.max(0, Math.min(percent * duration, duration));
        onSeek?.(newPosition);
      }
      setIsDraggingProgress(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingProgress, duration, onSeek]);

  // Volume bar drag handlers
  const handleVolumeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      if (!volumeRef.current) return;
      e.preventDefault();
      setIsDraggingVolume(true);

      const rect = volumeRef.current.getBoundingClientRect();
      const newVolume = Math.max(
        0,
        Math.min((e.clientX - rect.left) / rect.width, 1)
      );
      setVolume(newVolume);
    },
    []
  );

  useEffect(() => {
    if (!isDraggingVolume) return;

    const handleMouseMove = (e: MouseEvent): void => {
      if (!volumeRef.current) return;
      const rect = volumeRef.current.getBoundingClientRect();
      const newVolume = Math.max(
        0,
        Math.min((e.clientX - rect.left) / rect.width, 1)
      );
      setVolume(newVolume);
    };

    const handleMouseUp = (e: MouseEvent): void => {
      if (volumeRef.current) {
        const rect = volumeRef.current.getBoundingClientRect();
        const newVolume = Math.max(
          0,
          Math.min((e.clientX - rect.left) / rect.width, 1)
        );
        onVolumeChange?.(newVolume);
      }
      setIsDraggingVolume(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingVolume, onVolumeChange]);

  const progressPercent = duration ? (localPosition / duration) * 100 : 0;

  // Non-premium message
  if (isPremium === false) {
    return (
      <div className="player player--disabled">
        <div className="player-premium-message">
          <span className="player-premium-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
            </svg>
          </span>
          <span>Spotify Premium required for full playback</span>
          <span className="player-premium-hint">
            Click tracks on the chart to hear 30-second previews
          </span>
        </div>
      </div>
    );
  }

  // Loading state
  if (!isReady || isPremium === null) {
    return (
      <div className="player player--loading">
        <div className="player-loading-content">
          <div className="player-loading-spinner"></div>
          <span>Connecting to Spotify...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !currentTrack) {
    return (
      <div className="player player--error">
        <span className="player-error-message">{error}</span>
      </div>
    );
  }

  return (
    <div className="player">
      {/* Album Art */}
      <div className="player-artwork">
        {currentTrack?.album?.images?.[0]?.url ||
        currentTrack?.album?.images?.[2]?.url ? (
          <img
            src={
              currentTrack.album.images[2]?.url ||
              currentTrack.album.images[0]?.url
            }
            alt={currentTrack.album.name}
            className="player-artwork-img"
          />
        ) : (
          <div className="player-artwork-placeholder">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        )}
      </div>

      {/* Track Info */}
      <div className="player-info">
        {currentTrack ? (
          <>
            <a
              href={
                currentTrack.external_urls?.spotify ||
                `https://open.spotify.com/track/${currentTrack.id}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="player-track-name"
            >
              {currentTrack.name}
            </a>
            <span className="player-track-artists">
              {currentTrack.artists?.map((artist, idx) => (
                <span key={artist.id || artist.uri}>
                  {idx > 0 && ', '}
                  <a
                    href={
                      artist.external_urls?.spotify ||
                      `https://open.spotify.com/artist/${artist.id || artist.uri?.split(':')[2]}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="player-artist-link"
                  >
                    {artist.name}
                  </a>
                </span>
              ))}
            </span>
          </>
        ) : (
          <span className="player-no-track">
            Click a track on the chart to play
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="player-controls">
        <button
          className="player-btn player-btn--secondary"
          onClick={onPrevious}
          disabled={!currentTrack}
          title="Previous"
        >
          <PrevIcon />
        </button>
        <button
          className="player-btn player-btn--primary"
          onClick={onTogglePlay}
          disabled={!currentTrack}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          className="player-btn player-btn--secondary"
          onClick={onNext}
          disabled={!currentTrack}
          title="Next"
        >
          <NextIcon />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="player-progress">
        <span className="player-time">{formatTime(localPosition)}</span>
        <div
          ref={progressRef}
          className={`player-progress-bar${isDraggingProgress ? ' is-dragging' : ''}`}
          onMouseDown={handleProgressMouseDown}
        >
          <div
            className="player-progress-fill"
            style={{ transform: `scaleX(${progressPercent / 100})` }}
          />
          <div
            className="player-progress-handle"
            style={{ left: `${progressPercent}%` }}
          />
        </div>
        <span className="player-time">{formatTime(duration)}</span>
      </div>

      {/* Volume */}
      <div className="player-volume">
        <button
          className="player-btn player-btn--icon"
          onClick={() => {
            const newVolume = volume > 0 ? 0 : 0.5;
            setVolume(newVolume);
            onVolumeChange?.(newVolume);
          }}
          title={volume > 0 ? 'Mute' : 'Unmute'}
        >
          <VolumeIcon level={volume} />
        </button>
        <div
          ref={volumeRef}
          className={`player-volume-bar${isDraggingVolume ? ' is-dragging' : ''}`}
          onMouseDown={handleVolumeMouseDown}
        >
          <div
            className="player-volume-fill"
            style={{ transform: `scaleX(${volume})` }}
          />
          <div
            className="player-volume-handle"
            style={{ left: `${volume * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default Player;
