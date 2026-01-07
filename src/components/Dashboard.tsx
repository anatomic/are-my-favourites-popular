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
import type { DashboardProps, SavedTrack, SpotifyTrack } from '../types/spotify';
import Footer from './Footer';
import { ShareButtonGroup } from './sharing';
import './dashboard.css';
import './graph.css';

interface ChartStats {
  total: number;
  avgPopularity: number;
  maxPopularity: number;
  zeroCount: number;
  topTrackId: string;
}

function Dashboard({ tracks, artistMap, onLogout, getAccessToken }: DashboardProps): ReactElement {
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
    const zeroCount = tracks.filter((d: SavedTrack) => d.track.popularity === 0).length;
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
    const isFirstDataRender = container.empty() || container.selectAll('circle').empty();

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
          Are My Favourites <span className="text-green">Popular?</span>
        </h1>
        <p className="subtitle">
          Popularity scores reflect current streaming activity, not when you added each track
        </p>
        <p className="helper-text">Click any track to play it in the player below</p>
        {chartStats && (
          <div className="dashboard-share">
            <ShareButtonGroup
              stats={{
                totalTracks: chartStats.total,
                avgPopularity: chartStats.avgPopularity,
              }}
              variant="secondary"
              showToggle={true}
            />
          </div>
        )}
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
                <span className="chart-stat-value">{chartStats.total.toLocaleString()}</span>
                <span className="chart-stat-label">Total Tracks</span>
              </div>
              <div className="chart-stat">
                <span className="chart-stat-value">{chartStats.avgPopularity}</span>
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

      {tracks && <Stats tracks={tracks} artistMap={artistMap} onPlayTrack={playTrack} />}

      <Footer onLogout={onLogout} />
    </div>
  );
}

export default Dashboard;
