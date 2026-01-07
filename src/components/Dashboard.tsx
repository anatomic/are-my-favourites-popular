import type { ReactElement } from 'react';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { select } from 'd3-selection';
import { min, max, mean } from 'd3-array';
import { scalePow, scaleTime, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { timeYear } from 'd3-time';
import { interpolateRgb } from 'd3-interpolate';
import Stats from './Stats';
import Player from './Player';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';
import type { DashboardProps, SavedTrack, SpotifyTrack } from '../types/spotify';
import './dashboard.css';
import './graph.css';

// Spotify gradient colors (from brand assets)
const GRADIENT = {
  low: '#6900BA',    // Purple - low popularity
  high: '#FF9E95',   // Coral - high popularity
};

// Design system colors
const COLORS = {
  green: '#1DB954',
  greenLight: '#1ED760',
  surface: '#282828',
  muted: '#535353',
  text: '#B3B3B3',
  grid: 'rgba(255, 255, 255, 0.06)',
};

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
  const maxWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 80, 1400) : 800;
  const maxHeight = typeof window !== 'undefined' ? Math.min(window.innerHeight - 280, 500) : 400;

  // Chart margins
  const margin = { top: 40, right: 30, bottom: 50, left: 60 };
  const chartWidth = maxWidth - margin.left - margin.right;

  // Calculate chart stats
  const chartStats = useMemo((): ChartStats | null => {
    if (!tracks || tracks.length === 0) return null;
    const avgPop = mean(tracks, (d: SavedTrack) => d.track.popularity) ?? 0;
    const maxPop = max(tracks, (d: SavedTrack) => d.track.popularity) ?? 0;
    const zeroCount = tracks.filter((d: SavedTrack) => d.track.popularity === 0).length;
    // Find the track with highest popularity
    const topTrack = tracks.reduce((best: SavedTrack, curr: SavedTrack) =>
      curr.track.popularity > best.track.popularity ? curr : best
    , tracks[0]);
    return {
      total: tracks.length,
      avgPopularity: Math.round(avgPop),
      maxPopularity: maxPop,
      zeroCount,
      topTrackId: topTrack.track.id,
    };
  }, [tracks]);
  const chartHeight = maxHeight - margin.top - margin.bottom;

  // Spotify Web Playback SDK
  const player = useSpotifyPlayer(getAccessToken);

  // Play a track - SDK only (Premium required)
  const playTrack = useCallback(async (track: SpotifyTrack): Promise<void> => {
    // Only play if SDK is ready and user has Premium
    if (!player.isReady || !player.isPremium) {
      // Player component shows "Premium required" message
      return;
    }

    const trackUri = `spotify:track:${track.id}`;
    await player.play(trackUri);
  }, [player]);

  useEffect(() => {
    if (!tracks || !svgRef.current) return;

    // Clear previous chart
    select(svgRef.current).selectAll('*').remove();

    const sortedTracks = [...tracks].sort(
      (a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
    );

    const svg = select(svgRef.current);

    // Create gradient definition
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', 'popularityGradient')
      .attr('x1', '0%')
      .attr('y1', '100%')
      .attr('x2', '0%')
      .attr('y2', '0%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', GRADIENT.low);
    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', GRADIENT.high);

    // Scales
    const first = min(sortedTracks, (d: SavedTrack) => new Date(d.added_at));
    const last = max(sortedTracks, (d: SavedTrack) => new Date(d.added_at));
    const today = new Date();
    const maxPop = max(sortedTracks, (d: SavedTrack) => d.track.popularity) ?? 0;

    const r = scalePow().exponent(1.5).domain([0, 100]).range([3, 18]);
    const x = scaleTime()
      .domain([first ?? today, (last ?? today) > today ? (last ?? today) : today])
      .range([margin.left, maxWidth - margin.right])
      .nice();
    const y = scaleLinear()
      .domain([0, Math.ceil(maxPop / 10) * 10]) // Round up to nearest 10
      .range([maxHeight - margin.bottom, margin.top]);

    // Color scale based on popularity
    const colorScale = (popularity: number): string => {
      const t = popularity / 100;
      return interpolateRgb(GRADIENT.low, GRADIENT.high)(t);
    };

    // Axes
    const xAxis = axisBottom(x).ticks(timeYear.every(1));
    const yAxis = axisLeft(y).ticks(5);

    // Draw horizontal grid lines
    const gridLines = [20, 40, 60, 80, 100].filter(v => v <= Math.ceil(maxPop / 10) * 10);
    svg.selectAll('.grid-line')
      .data(gridLines)
      .enter()
      .append('line')
      .attr('class', 'grid-line')
      .attr('x1', margin.left)
      .attr('x2', maxWidth - margin.right)
      .attr('y1', (d: number) => y(d))
      .attr('y2', (d: number) => y(d))
      .attr('stroke', COLORS.grid)
      .attr('stroke-width', 1);

    // Draw axes
    svg
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${maxHeight - margin.bottom})`)
      .call(xAxis);

    svg
      .append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(${margin.left},0)`)
      .call(yAxis);

    // Y-axis label
    svg
      .append('text')
      .attr('class', 'axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(maxHeight / 2))
      .attr('y', 16)
      .attr('text-anchor', 'middle')
      .text('Popularity Score');

    // Data points colored by popularity (top track highlighted in green)
    svg
      .selectAll('circle')
      .data(sortedTracks)
      .enter()
      .append('circle')
      .attr('r', (d: SavedTrack) => d.track.popularity === maxPop ? r(d.track.popularity) * 1.2 : r(d.track.popularity))
      .attr('cx', (d: SavedTrack) => x(new Date(d.added_at)))
      .attr('cy', (d: SavedTrack) => y(d.track.popularity))
      .attr('fill', (d: SavedTrack) => d.track.popularity === maxPop ? COLORS.green : colorScale(d.track.popularity))
      .attr('opacity', (d: SavedTrack) => d.track.popularity === maxPop ? 1 : 0.75)
      .attr('stroke', (d: SavedTrack) => d.track.popularity === maxPop ? COLORS.greenLight : 'rgba(0,0,0,0.2)')
      .attr('stroke-width', (d: SavedTrack) => d.track.popularity === maxPop ? 2 : 0.5)
      .style('cursor', 'pointer')
      .on('click', function (_event: MouseEvent, d: SavedTrack) {
        // Play track via SDK or preview
        playTrack(d.track);
      })
      .on('mouseover', function (this: SVGCircleElement, event: MouseEvent, d: SavedTrack) {
        select(this)
          .attr('opacity', 1)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2)
          .attr('r', r(d.track.popularity) * 1.4);
        const tooltip = tooltipRef.current;
        if (tooltip) {
          const addedDate = new Date(d.added_at).toLocaleDateString();
          const popColor = colorScale(d.track.popularity);
          tooltip.innerHTML = `
            <strong>${d.track.name}</strong>
            <span class="tooltip-artist">${d.track.artists.map(a => a.name).join(', ')}</span>
            <span class="tooltip-album">${d.track.album.name}</span>
            <span class="tooltip-stat">
              <span class="tooltip-label">Popularity</span>
              <span class="tooltip-value" style="color: ${popColor}">${d.track.popularity}</span>
            </span>
            <span class="tooltip-stat">
              <span class="tooltip-label">Added</span>
              <span class="tooltip-value">${addedDate}</span>
            </span>
          `;
          tooltip.style.opacity = '1';
          tooltip.style.left = `${event.pageX + 15}px`;
          tooltip.style.top = `${event.pageY - 10}px`;
        }
      })
      .on('mouseout', function (this: SVGCircleElement, _event: MouseEvent, d: SavedTrack) {
        select(this)
          .attr('opacity', 0.75)
          .attr('stroke', 'rgba(0,0,0,0.2)')
          .attr('stroke-width', 0.5)
          .attr('r', r(d.track.popularity));
        const tooltip = tooltipRef.current;
        if (tooltip) {
          tooltip.style.opacity = '0';
        }
      });

    // Legend
    const legendX = maxWidth - margin.right - 170;
    const legendY = margin.top;

    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${legendX}, ${legendY})`);

    // Legend background
    legend.append('rect')
      .attr('x', -12)
      .attr('y', -12)
      .attr('width', 150)
      .attr('height', 64)
      .attr('fill', 'rgba(18, 18, 18, 0.9)')
      .attr('rx', 8);

    // Gradient bar
    const gradientBar = legend.append('g').attr('transform', 'translate(0, 0)');
    gradientBar.append('rect')
      .attr('width', 12)
      .attr('height', 40)
      .attr('fill', 'url(#popularityGradient)')
      .attr('rx', 2);
    gradientBar.append('text')
      .attr('x', 18)
      .attr('y', 8)
      .attr('class', 'legend-label')
      .text('High popularity');
    gradientBar.append('text')
      .attr('x', 18)
      .attr('y', 38)
      .attr('class', 'legend-label')
      .text('Low popularity');

  }, [tracks, maxWidth, maxHeight, margin.left, margin.right, margin.top, margin.bottom, chartWidth, chartHeight, playTrack]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Are my favourites <span className="text-green">popular?</span></h1>
        <p className="subtitle">Popularity scores reflect current streaming activity, not when you added each track</p>
      </header>

      {tracks ? (
        <div className="chart-container">
          <div className="chart-wrapper">
            <svg ref={svgRef} width="100%" height={maxHeight}></svg>
            <div ref={tooltipRef} className="tooltip"></div>
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
                <span className="chart-stat-value chart-stat-value--highlight">{chartStats.maxPopularity}</span>
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
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          {' '}by{' '}
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
