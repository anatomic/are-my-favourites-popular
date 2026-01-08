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
import type { DashboardProps, SavedTrack, SpotifyArtist, SpotifyTrack } from '../types/spotify';
import Footer from './Footer';
import { ShareButtonGroup } from './sharing';
import './dashboard.css';
import './graph.css';

interface ChartStats {
  total: number;
  avgPopularity: number;
  maxPopularity: number;
  hipsterScore: number;
  mainstreamScore: number;
  hiddenGems: number;
  deepCuts: number;
  uniqueArtists: number;
  uniqueGenres: number;
  collectionAge: string;
  topTrack: SpotifyTrack;
  mostSavedArtist: SpotifyArtist | null;
  mostPopularArtist: SpotifyArtist | null;
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
    const topTrack = tracks.reduce(
      (best: SavedTrack, curr: SavedTrack) =>
        curr.track.popularity > best.track.popularity ? curr : best,
      tracks[0]
    );

    // Hipster/Mainstream scores (% of tracks)
    const hipsterCount = tracks.filter(
      (d) => d.track.popularity > 0 && d.track.popularity < 30
    ).length;
    const mainstreamCount = tracks.filter((d) => d.track.popularity >= 70).length;
    const hipsterScore = Math.round((hipsterCount / tracks.length) * 100);
    const mainstreamScore = Math.round((mainstreamCount / tracks.length) * 100);

    // Hidden gems (1-20 popularity) and deep cuts (0 popularity)
    const hiddenGems = tracks.filter(
      (d) => d.track.popularity > 0 && d.track.popularity <= 20
    ).length;
    const deepCuts = tracks.filter((d) => d.track.popularity === 0).length;

    // Unique artists and genres, with popularity tracking
    const artistIds = new Set<string>();
    const genreSet = new Set<string>();
    const artistStats = new Map<string, { count: number; totalPop: number }>();

    tracks.forEach((t) => {
      // Skip local tracks for popularity calculations (they always have 0)
      const trackPop = t.track.is_local ? 0 : t.track.popularity;
      const isLocalTrack = t.track.is_local;

      t.track.artists.forEach((artist) => {
        artistIds.add(artist.id);

        // Track count and popularity per artist
        const stats = artistStats.get(artist.id) ?? { count: 0, totalPop: 0 };
        stats.count++;
        if (!isLocalTrack) {
          stats.totalPop += trackPop;
        }
        artistStats.set(artist.id, stats);

        // Get genres from artistMap
        const fullArtist = artistMap?.get(artist.id);
        fullArtist?.genres?.forEach((genre) => genreSet.add(genre));
      });
    });

    // Find most frequently saved artist
    let mostSavedArtistId = '';
    let maxCount = 0;
    artistStats.forEach((stats, id) => {
      if (stats.count > maxCount) {
        maxCount = stats.count;
        mostSavedArtistId = id;
      }
    });
    const mostSavedArtist = artistMap?.get(mostSavedArtistId) ?? null;

    // Find most popular artist (by Spotify artist popularity score)
    let mostPopularArtist: SpotifyArtist | null = null;
    let highestPopularity = -1;
    artistIds.forEach((id) => {
      const artist = artistMap?.get(id);
      if (artist?.popularity !== undefined && artist.popularity > highestPopularity) {
        highestPopularity = artist.popularity;
        mostPopularArtist = artist;
      }
    });

    // Collection age (time since first saved track) as decimal years
    const dates = tracks.map((t) => new Date(t.added_at).getTime());
    const oldestDate = new Date(Math.min(...dates));
    const now = new Date();
    const diffMs = now.getTime() - oldestDate.getTime();
    const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
    const collectionAge = diffYears >= 1 ? diffYears.toFixed(1) : diffYears.toFixed(2);

    return {
      total: tracks.length,
      avgPopularity: Math.round(avgPop),
      maxPopularity: maxPop,
      hipsterScore,
      mainstreamScore,
      hiddenGems,
      deepCuts,
      uniqueArtists: artistIds.size,
      uniqueGenres: genreSet.size,
      collectionAge,
      topTrack: topTrack.track,
      mostSavedArtist,
      mostPopularArtist,
    };
  }, [tracks, artistMap]);

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
        <p className="helper-text">Click any track to play it in the player below</p>
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
          <div className="chart-info">
            <div className="chart-legend">
              <div className="chart-legend-gradient"></div>
              <div className="chart-legend-labels">
                <span>High popularity</span>
                <span>Low popularity</span>
              </div>
              <p className="chart-legend-note">
                Based on your Liked Songs. Popularity reflects current streaming activity, not when
                you saved each track.
              </p>
            </div>
            {chartStats && (
              <>
                <div className="chart-info-separator"></div>
                <div className="chart-highlights">
                  <a
                    href={chartStats.topTrack.external_urls.spotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chart-highlight"
                  >
                    <img
                      src={
                        chartStats.topTrack.album.images[1]?.url ??
                        chartStats.topTrack.album.images[0]?.url
                      }
                      alt={chartStats.topTrack.album.name}
                      className="chart-highlight__img"
                    />
                    <span className="chart-highlight__label">Top Track</span>
                    <span className="chart-highlight__name">{chartStats.topTrack.name}</span>
                  </a>
                  {chartStats.mostSavedArtist?.images?.[0] && (
                    <a
                      href={chartStats.mostSavedArtist.external_urls.spotify}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chart-highlight"
                    >
                      <img
                        src={
                          chartStats.mostSavedArtist.images[1]?.url ??
                          chartStats.mostSavedArtist.images[0]?.url
                        }
                        alt={chartStats.mostSavedArtist.name}
                        className="chart-highlight__img"
                      />
                      <span className="chart-highlight__label">Most Saved</span>
                      <span className="chart-highlight__name">
                        {chartStats.mostSavedArtist.name}
                      </span>
                    </a>
                  )}
                  {chartStats.mostPopularArtist?.images?.[0] && (
                    <a
                      href={chartStats.mostPopularArtist.external_urls.spotify}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chart-highlight"
                    >
                      <img
                        src={
                          chartStats.mostPopularArtist.images[1]?.url ??
                          chartStats.mostPopularArtist.images[0]?.url
                        }
                        alt={chartStats.mostPopularArtist.name}
                        className="chart-highlight__img"
                      />
                      <span className="chart-highlight__label">Most Popular</span>
                      <span className="chart-highlight__name">
                        {chartStats.mostPopularArtist.name}
                      </span>
                    </a>
                  )}
                </div>
                <div className="chart-info-separator"></div>
                <div className="chart-stats">
                  <div className="chart-stat">
                    <span className="chart-stat-value">{chartStats.total.toLocaleString()}</span>
                    <span className="chart-stat-label">Tracks</span>
                  </div>
                  <div className="chart-stat">
                    <span className="chart-stat-value">{chartStats.uniqueArtists}</span>
                    <span className="chart-stat-label">Artists</span>
                  </div>
                  <div className="chart-stat">
                    <span className="chart-stat-value">{chartStats.uniqueGenres}</span>
                    <span className="chart-stat-label">Genres</span>
                  </div>
                  <div className="chart-stat">
                    <span className="chart-stat-value">{chartStats.collectionAge}</span>
                    <span className="chart-stat-label">Years Collecting</span>
                  </div>
                </div>
                <div className="chart-info-separator"></div>
                <div className="chart-stats">
                  <div className="chart-stat">
                    <span className="chart-stat-value">{chartStats.hipsterScore}%</span>
                    <span className="chart-stat-label">Hipster</span>
                  </div>
                  <div className="chart-stat">
                    <span className="chart-stat-value">{chartStats.mainstreamScore}%</span>
                    <span className="chart-stat-label">Mainstream</span>
                  </div>
                  <div className="chart-stat">
                    <span className="chart-stat-value">{chartStats.hiddenGems}</span>
                    <span className="chart-stat-label">Hidden Gems</span>
                  </div>
                  <div className="chart-stat">
                    <span className="chart-stat-value">{chartStats.deepCuts}</span>
                    <span className="chart-stat-label">Deep Cuts</span>
                  </div>
                </div>
              </>
            )}
          </div>
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

      {tracks && <Stats tracks={tracks} artistMap={artistMap} onPlayTrack={playTrack} />}

      <Footer onLogout={onLogout} />
    </div>
  );
}

export default Dashboard;
