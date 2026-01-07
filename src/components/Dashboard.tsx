import type { ReactElement } from 'react';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { select } from 'd3-selection';
import { mean, max } from 'd3-array';
import Stats from './Stats';
import Player from './Player';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';
import { useChartConfig, useContainerSize } from '../hooks/useChartConfig';
import {
  renderGradientDef,
  renderGridLines,
  renderAxes,
  renderDataPoints,
  setupDataPointHandlers,
  createTooltipContent,
} from './chart';
import type {
  DashboardProps,
  SavedTrack,
  SpotifyTrack,
} from '../types/spotify';
import './dashboard.css';
import './graph.css';

interface ChartStats {
  total: number;
  avgPopularity: number;
  maxPopularity: number;
  zeroCount: number;
  topTrackId: string;
}

function Dashboard({
  tracks,
  artistMap,
  onLogout,
  getAccessToken,
}: DashboardProps): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const animatingRef = useRef(false);

  // Responsive chart sizing via ResizeObserver
  const containerSize = useContainerSize(chartContainerRef);

  // Chart configuration (dimensions, scales, sorted data)
  const chartConfig = useChartConfig(tracks, containerSize);

  // Calculate chart stats for display
  const chartStats = useMemo((): ChartStats | null => {
    if (!tracks || tracks.length === 0) return null;
    const avgPop = mean(tracks, (d: SavedTrack) => d.track.popularity) ?? 0;
    const maxPop = max(tracks, (d: SavedTrack) => d.track.popularity) ?? 0;
    const zeroCount = tracks.filter(
      (d: SavedTrack) => d.track.popularity === 0
    ).length;
    const topTrack = tracks.reduce(
      (best: SavedTrack, curr: SavedTrack) =>
        curr.track.popularity > best.track.popularity ? curr : best,
      tracks[0]
    );
    return {
      total: tracks.length,
      avgPopularity: Math.round(avgPop),
      maxPopularity: maxPop,
      zeroCount,
      topTrackId: topTrack.track.id,
    };
  }, [tracks]);

  // Spotify Web Playback SDK
  const player = useSpotifyPlayer(getAccessToken);

  // Play a track - SDK only (Premium required)
  const playTrack = useCallback(
    async (track: SpotifyTrack): Promise<void> => {
      if (!player.isReady || !player.isPremium) {
        return;
      }
      const trackUri = `spotify:track:${track.id}`;
      await player.play(trackUri);
    },
    [player]
  );

  // Tooltip event handlers
  const handleMouseOver = useCallback(
    (event: MouseEvent, track: SavedTrack, popColor: string): void => {
      const tooltip = tooltipRef.current;
      const target = event.target as SVGCircleElement;

      if (chartConfig) {
        select(target)
          .attr('opacity', 1)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2)
          .attr('r', chartConfig.scales.radius(track.track.popularity) * 1.4);
      }

      if (tooltip) {
        tooltip.innerHTML = createTooltipContent(track, popColor);
        tooltip.style.opacity = '1';
        tooltip.style.left = `${event.pageX + 15}px`;
        tooltip.style.top = `${event.pageY - 10}px`;
      }
    },
    [chartConfig]
  );

  const handleMouseOut = useCallback(
    (_event: MouseEvent, track: SavedTrack): void => {
      const tooltip = tooltipRef.current;
      const target = _event.target as SVGCircleElement;

      if (chartConfig) {
        select(target)
          .attr('opacity', 0.75)
          .attr('stroke', 'rgba(0,0,0,0.2)')
          .attr('stroke-width', 0.5)
          .attr('r', chartConfig.scales.radius(track.track.popularity));
      }

      if (tooltip) {
        tooltip.style.opacity = '0';
      }
    },
    [chartConfig]
  );

  // Set up event handlers once - only when handlers change
  useEffect(() => {
    if (!chartConfig || !svgRef.current) return;

    const svg = select(svgRef.current);

    // Set up event delegation on data points container (3 handlers total, not N*3)
    // This uses event bubbling so we don't need to reattach handlers to each circle
    setupDataPointHandlers(svg, chartConfig, {
      onClick: playTrack,
      onMouseOver: handleMouseOver,
      onMouseOut: handleMouseOut,
    });
  }, [playTrack, handleMouseOver, handleMouseOut, chartConfig]);

  // Render the D3 chart with modern join() pattern
  // Only clears on first render; subsequent renders animate changes
  useEffect(() => {
    if (!chartConfig || !svgRef.current) return;

    const svg = select(svgRef.current);

    // Check if this is the initial render (no gradient def yet)
    const isInitialRender = svg.select('defs').empty();

    if (isInitialRender) {
      // First render: set up static elements
      renderGradientDef(svg);
    }

    // Clear and re-render structural elements (axes, grid)
    // These appear instantly without animation
    svg.selectAll('.grid-line, .x-axis, .y-axis, .axis-label').remove();
    renderGridLines(svg, chartConfig);
    renderAxes(svg, chartConfig);

    // Check if this is the first data render (no circles yet)
    const container = svg.select('g.data-points-container');
    const isFirstDataRender =
      container.empty() || container.selectAll('circle').empty();

    if (isFirstDataRender) {
      // First render: animate from bottom with stagger
      animatingRef.current = true;
      renderDataPoints(svg, chartConfig);
      // Allow updates after animation completes (600ms transition + 1000ms max stagger)
      const timeoutId = setTimeout(() => {
        animatingRef.current = false;
      }, 1600);

      // Cleanup timeout on unmount or config change
      return () => clearTimeout(timeoutId);
    } else if (!animatingRef.current) {
      // Subsequent renders: smooth transitions (only if not currently animating)
      renderDataPoints(svg, chartConfig);
    }
    // If animating, skip data point update to prevent transition interruption
  }, [chartConfig]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>
          Are my favourites <span className="text-green">popular?</span>
        </h1>
        <p className="subtitle">
          Popularity scores reflect current streaming activity, not when you
          added each track
        </p>
        <p className="helper-text">
          Click any track to play it in the player below
        </p>
      </header>

      {tracks ? (
        <div className="chart-container">
          <div className="chart-wrapper" ref={chartContainerRef}>
            <svg
              ref={svgRef}
              width={chartConfig?.dimensions.width ?? '100%'}
              height={chartConfig?.dimensions.height ?? 400}
              style={{ visibility: chartConfig ? 'visible' : 'hidden' }}
            ></svg>
            <div ref={tooltipRef} className="tooltip"></div>
          </div>
          <div className="chart-legend">
            <div className="chart-legend-gradient"></div>
            <div className="chart-legend-labels">
              <span>High popularity</span>
              <span>Low popularity</span>
            </div>
          </div>
          {chartStats && (
            <div className="chart-stats">
              <div className="chart-stat">
                <span className="chart-stat-value">
                  {chartStats.total.toLocaleString()}
                </span>
                <span className="chart-stat-label">Total Tracks</span>
              </div>
              <div className="chart-stat">
                <span className="chart-stat-value">
                  {chartStats.avgPopularity}
                </span>
                <span className="chart-stat-label">Avg Popularity</span>
              </div>
              <div className="chart-stat">
                <span className="chart-stat-value chart-stat-value--highlight">
                  {chartStats.maxPopularity}
                </span>
                <span className="chart-stat-label">Highest</span>
              </div>
              <div className="chart-stat">
                <span className="chart-stat-value">{chartStats.zeroCount}</span>
                <span className="chart-stat-label">Zero Popularity</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Loading your tracks...</p>
        </div>
      )}

      {/* Playback Widget */}
      <Player
        isReady={player.isReady}
        isPremium={player.isPremium}
        currentTrack={player.currentTrack}
        isPlaying={player.isPlaying}
        position={player.position}
        duration={player.duration}
        error={player.error}
        currentDevice={player.currentDevice}
        onTogglePlay={player.togglePlay}
        onSeek={player.seek}
        onPrevious={player.previousTrack}
        onNext={player.nextTrack}
        onVolumeChange={player.setVolume}
      />

      {tracks && (
        <Stats tracks={tracks} artistMap={artistMap} onPlayTrack={playTrack} />
      )}

      <footer className="dashboard-footer">
        <button onClick={onLogout} className="btn btn--secondary">
          Log out
        </button>
        <div className="attribution">
          Made with{' '}
          <svg
            className="heart-icon"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
            aria-label="love"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>{' '}
          by{' '}
          <a
            href="https://twitter.com/anatomic"
            target="_blank"
            rel="noopener noreferrer"
            className="attribution-link"
          >
            @anatomic
          </a>
          {' · '}
          <a
            href="https://github.com/anatomic"
            target="_blank"
            rel="noopener noreferrer"
            className="attribution-link"
          >
            GitHub
          </a>
        </div>
        <a
          href="https://www.spotify.com"
          target="_blank"
          rel="noopener noreferrer"
          className="powered-by-spotify"
        >
          <span>Powered by</span>
          <svg
            viewBox="0 0 236.05 225.25"
            width="24"
            height="23"
            aria-label="Spotify"
          >
            <path
              fill="#1ed760"
              d="m122.37,3.31C61.99.91,11.1,47.91,8.71,108.29c-2.4,60.38,44.61,111.26,104.98,113.66,60.38,2.4,111.26-44.6,113.66-104.98C229.74,56.59,182.74,5.7,122.37,3.31Zm46.18,160.28c-1.36,2.4-4.01,3.6-6.59,3.24-.79-.11-1.58-.37-2.32-.79-14.46-8.23-30.22-13.59-46.84-15.93-16.62-2.34-33.25-1.53-49.42,2.4-3.51.85-7.04-1.3-7.89-4.81-.85-3.51,1.3-7.04,4.81-7.89,17.78-4.32,36.06-5.21,54.32-2.64,18.26,2.57,35.58,8.46,51.49,17.51,3.13,1.79,4.23,5.77,2.45,8.91Zm14.38-28.72c-2.23,4.12-7.39,5.66-11.51,3.43-16.92-9.15-35.24-15.16-54.45-17.86-19.21-2.7-38.47-1.97-57.26,2.16-1.02.22-2.03.26-3.01.12-3.41-.48-6.33-3.02-7.11-6.59-1.01-4.58,1.89-9.11,6.47-10.12,20.77-4.57,42.06-5.38,63.28-2.4,21.21,2.98,41.46,9.62,60.16,19.74,4.13,2.23,5.66,7.38,3.43,11.51Zm15.94-32.38c-2.1,4.04-6.47,6.13-10.73,5.53-1.15-.16-2.28-.52-3.37-1.08-19.7-10.25-40.92-17.02-63.07-20.13-22.15-3.11-44.42-2.45-66.18,1.97-5.66,1.15-11.17-2.51-12.32-8.16-1.15-5.66,2.51-11.17,8.16-12.32,24.1-4.89,48.74-5.62,73.25-2.18,24.51,3.44,47.99,10.94,69.81,22.29,5.12,2.66,7.11,8.97,4.45,14.09Z"
            />
          </svg>
        </a>
      </footer>
    </div>
  );
}

export default Dashboard;
