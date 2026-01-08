import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { interpolateRgb } from 'd3-interpolate';
import type { StatsProps, SavedTrack, SpotifyArtist } from '../types/spotify';
import { cssColors } from '../utils/cssVariables';
import './stats.css';

// Convert string to title case
function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

// Internal types for stats calculations
interface ArtistStats {
  id: string;
  name: string;
  count: number;
  years: Set<number>;
}

interface ArtistStatsWithAvg {
  id: string;
  name: string;
  count: number;
  avgPopularity: number;
  years: number[];
}

interface GenreStats {
  genre: string;
  count: number;
  avgPopularity: number;
  years: number[];
}

interface YearData {
  count: number;
  totalPop: number;
}

interface YearlySummaryItem {
  year: number;
  count: number;
  avgPopularity: number;
  growth: number;
  countRank: number;
  popRank: number;
  lowPopRank: number;
  growthRank: number;
}

type SortMode = 'count' | 'popularity';

// Heatmap types
interface DayCount {
  date: Date | null;
  count: number; // -1 for empty padding cells
  dayOfWeek: number;
}

interface YearHeatmapData {
  year: number;
  weeks: DayCount[][];
  minCount: number; // Minimum non-zero count for that year
  maxCount: number;
}

interface HeatmapTooltip {
  date: Date;
  count: number;
  x: number;
  y: number;
}

// Quarter-based grey backgrounds for 0-track cells
// Four distinct shades for visual progression through the year
// Darkest must be lighter than container background (#181818)
const QUARTER_GREYS = [
  '#3a3a3a', // Q1 (Jan-Mar) - lightest
  '#313131', // Q2 (Apr-Jun)
  '#282828', // Q3 (Jul-Sep)
  '#202020', // Q4 (Oct-Dec) - darkest
];
// Map month (0-11) to quarter grey
const getMonthGrey = (month: number): string => QUARTER_GREYS[Math.floor(month / 3)];

// Generate heatmap color based on track count for a specific year
// Scale from dark green (fewest tracks) to bright Spotify green (most tracks)
// 0 tracks get quarter-based gray background for visual distinction
function getHeatmapColor(
  count: number,
  minCount: number,
  maxCount: number,
  month?: number
): string {
  if (count === 0) {
    // Use quarter-based grey if month is provided, otherwise default grey
    return month !== undefined ? getMonthGrey(month) : cssColors.surfaceHighlight;
  }
  // Scale from min to max (not 0 to max)
  // If all non-zero days have the same count, show full brightness
  const range = maxCount - minCount;
  const normalized = range > 0 ? (count - minCount) / range : 1;
  // Use sqrt for better distribution of lower values
  const sqrtNormalized = Math.sqrt(normalized);
  // Interpolate from dark green to bright Spotify green
  return interpolateRgb('#1a4d2e', cssColors.spotifyGreen)(sqrtNormalized);
}

function Stats({ tracks, artistMap, onPlayTrack }: StatsProps): ReactElement {
  // Top 20 most popular songs
  const top20Popular = useMemo((): SavedTrack[] => {
    return [...tracks].sort((a, b) => b.track.popularity - a.track.popularity).slice(0, 20);
  }, [tracks]);

  // Top 20 most niche songs (lowest popularity)
  const top20Niche = useMemo((): SavedTrack[] => {
    return [...tracks].sort((a, b) => a.track.popularity - b.track.popularity).slice(0, 20);
  }, [tracks]);

  // Sort state for artists and genres
  const [artistSort, setArtistSort] = useState<SortMode>('count');
  const [genreSort, setGenreSort] = useState<SortMode>('count');

  // Top 20 artists by track count (with Spotify artist popularity)
  const topArtists = useMemo((): ArtistStatsWithAvg[] => {
    const counts: Record<string, ArtistStats> = {};
    tracks.forEach((t: SavedTrack) => {
      const year = new Date(t.added_at).getFullYear();
      t.track.artists.forEach((a: SpotifyArtist) => {
        if (!counts[a.id]) {
          counts[a.id] = {
            id: a.id,
            name: a.name,
            count: 0,
            years: new Set(),
          };
        }
        counts[a.id].count++;
        counts[a.id].years.add(year);
      });
    });
    return Object.values(counts)
      .map(
        (a: ArtistStats): ArtistStatsWithAvg => ({
          id: a.id,
          name: a.name,
          count: a.count,
          // Use Spotify's artist popularity score
          avgPopularity: artistMap?.get(a.id)?.popularity ?? 0,
          years: [...a.years].sort((x, y) => x - y),
        })
      )
      .sort((a, b) =>
        artistSort === 'popularity' ? b.avgPopularity - a.avgPopularity : b.count - a.count
      )
      .slice(0, 20);
  }, [tracks, artistSort, artistMap]);

  // Genre breakdown (only if artistMap is loaded)
  // Uses average Spotify artist popularity weighted by track count
  const genreStats = useMemo((): GenreStats[] => {
    if (!artistMap || artistMap.size === 0) return [];

    const stats: Record<
      string,
      { count: number; artistCounts: Map<string, number>; years: Set<number> }
    > = {};
    tracks.forEach((t: SavedTrack) => {
      const year = new Date(t.added_at).getFullYear();
      t.track.artists.forEach((a: SpotifyArtist) => {
        const artist = artistMap.get(a.id);
        if (artist?.genres) {
          artist.genres.forEach((genre: string) => {
            if (!stats[genre]) {
              stats[genre] = { count: 0, artistCounts: new Map(), years: new Set() };
            }
            stats[genre].count++;
            stats[genre].artistCounts.set(a.id, (stats[genre].artistCounts.get(a.id) ?? 0) + 1);
            stats[genre].years.add(year);
          });
        }
      });
    });

    return Object.entries(stats)
      .map(([genre, data]): GenreStats => {
        // Calculate weighted average artist popularity (weighted by track count)
        let weightedTotal = 0;
        let totalWeight = 0;
        data.artistCounts.forEach((trackCount, id) => {
          const artistPop = artistMap.get(id)?.popularity ?? 0;
          weightedTotal += artistPop * trackCount;
          totalWeight += trackCount;
        });
        const avgArtistPop = totalWeight > 0 ? Math.round(weightedTotal / totalWeight) : 0;

        return {
          genre,
          count: data.count,
          avgPopularity: avgArtistPop,
          years: [...data.years].sort((x, y) => x - y),
        };
      })
      .sort((a, b) =>
        genreSort === 'popularity' ? b.avgPopularity - a.avgPopularity : b.count - a.count
      )
      .slice(0, 20);
  }, [tracks, artistMap, genreSort]);

  // Yearly summary - totals and avg popularity by year (ascending)
  const yearlySummary = useMemo((): YearlySummaryItem[] => {
    const byYear: Record<number, YearData> = {};
    tracks.forEach((t: SavedTrack) => {
      const year = new Date(t.added_at).getFullYear();
      if (!byYear[year]) {
        byYear[year] = { count: 0, totalPop: 0 };
      }
      byYear[year].count++;
      byYear[year].totalPop += t.track.popularity;
    });

    const years = Object.entries(byYear)
      .map(([year, data]) => ({
        year: parseInt(year),
        count: data.count,
        avgPopularity: Math.round(data.totalPop / data.count),
      }))
      .sort((a, b) => a.year - b.year);

    // Calculate rankings for highlights
    const sortedByCount = [...years].sort((a, b) => b.count - a.count);
    const sortedByPop = [...years].sort((a, b) => b.avgPopularity - a.avgPopularity);
    const sortedByLowPop = [...years].sort((a, b) => a.avgPopularity - b.avgPopularity);

    // Calculate year-over-year growth
    const withGrowth = years.map((y, i) => ({
      ...y,
      growth: i === 0 ? 0 : y.count - years[i - 1].count,
    }));
    const sortedByGrowth = [...withGrowth].sort((a, b) => b.growth - a.growth);

    // Add ranking info to each year
    return withGrowth.map(
      (y): YearlySummaryItem => ({
        ...y,
        countRank: sortedByCount.findIndex((s) => s.year === y.year) + 1,
        popRank: sortedByPop.findIndex((s) => s.year === y.year) + 1,
        lowPopRank: sortedByLowPop.findIndex((s) => s.year === y.year) + 1,
        growthRank: y.growth > 0 ? sortedByGrowth.findIndex((s) => s.year === y.year) + 1 : 999,
      })
    );
  }, [tracks]);

  // Heatmap data - aggregate tracks by day for each year
  const heatmapData = useMemo((): Map<number, YearHeatmapData> => {
    // Group tracks by date string 'YYYY-MM-DD'
    const countsByDate: Record<string, number> = {};
    const years = new Set<number>();

    tracks.forEach((t: SavedTrack) => {
      const dateKey = t.added_at.slice(0, 10);
      countsByDate[dateKey] = (countsByDate[dateKey] || 0) + 1;
      years.add(parseInt(dateKey.slice(0, 4)));
    });

    const result = new Map<number, YearHeatmapData>();

    // For each year, generate all days organized into weeks
    years.forEach((year) => {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);

      const weeks: DayCount[][] = [];
      let currentWeek: DayCount[] = [];

      // Pad first week with empty cells to align days of week
      const firstDayOfWeek = yearStart.getDay(); // 0=Sunday
      for (let i = 0; i < firstDayOfWeek; i++) {
        currentWeek.push({ date: null, count: -1, dayOfWeek: i });
      }

      let maxCount = 0;
      let minCount = Infinity;
      const current = new Date(yearStart);

      while (current <= yearEnd) {
        const dateKey = current.toISOString().slice(0, 10);
        const count = countsByDate[dateKey] || 0;
        if (count > maxCount) maxCount = count;
        if (count > 0 && count < minCount) minCount = count;

        currentWeek.push({
          date: new Date(current),
          count,
          dayOfWeek: current.getDay(),
        });

        if (currentWeek.length === 7) {
          weeks.push(currentWeek);
          currentWeek = [];
        }

        current.setDate(current.getDate() + 1);
      }

      // Push final partial week if any
      if (currentWeek.length > 0) {
        weeks.push(currentWeek);
      }

      // If no tracks this year, minCount defaults to maxCount (both 0)
      if (minCount === Infinity) minCount = maxCount;

      result.set(year, { year, weeks, minCount, maxCount: maxCount || 1 });
    });

    return result;
  }, [tracks]);

  // All years sorted descending (most recent first)
  const heatmapYearsSorted = useMemo((): YearHeatmapData[] => {
    return [...heatmapData.values()].sort((a, b) => b.year - a.year);
  }, [heatmapData]);

  // Global min/max across all years for consistent color scaling
  const globalHeatmapRange = useMemo((): { minCount: number; maxCount: number } => {
    let globalMin = Infinity;
    let globalMax = 0;
    heatmapYearsSorted.forEach((yearData) => {
      if (yearData.minCount < globalMin && yearData.minCount > 0) globalMin = yearData.minCount;
      if (yearData.maxCount > globalMax) globalMax = yearData.maxCount;
    });
    return { minCount: globalMin === Infinity ? 1 : globalMin, maxCount: globalMax || 1 };
  }, [heatmapYearsSorted]);

  // Tooltip state for heatmap
  const [heatmapTooltip, setHeatmapTooltip] = useState<HeatmapTooltip | null>(null);

  return (
    <div className="stats">
      <h2>Your Library Stats</h2>

      <div className="stats-grid">
        {/* Top 20 Most Popular */}
        <div className="stats-section">
          <h3>Top 20 Most Popular</h3>
          <ol className="stats-list stats-list--numbered">
            {top20Popular.map((item, i) => (
              <li key={i}>
                <span className="stats-track">
                  <button
                    className="stats-play-btn"
                    onClick={() => onPlayTrack?.(item.track)}
                    title="Play track"
                  >
                    <strong>{item.track.name}</strong>
                  </button>
                  <span className="stats-artist">
                    {item.track.artists.map((a, idx) => (
                      <span key={a.id}>
                        {idx > 0 && ', '}
                        <a
                          href={`https://open.spotify.com/artist/${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="stats-link stats-link--artist"
                        >
                          {a.name}
                        </a>
                      </span>
                    ))}
                  </span>
                </span>
                <span className="stats-value">{item.track.popularity}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Top 20 Most Niche */}
        <div className="stats-section">
          <h3>Top 20 Most Niche</h3>
          <ol className="stats-list stats-list--numbered">
            {top20Niche.map((item, i) => (
              <li key={i}>
                <span className="stats-track">
                  <button
                    className="stats-play-btn"
                    onClick={() => onPlayTrack?.(item.track)}
                    title="Play track"
                  >
                    <strong>{item.track.name}</strong>
                  </button>
                  <span className="stats-artist">
                    {item.track.artists.map((a, idx) => (
                      <span key={a.id}>
                        {idx > 0 && ', '}
                        <a
                          href={`https://open.spotify.com/artist/${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="stats-link stats-link--artist"
                        >
                          {a.name}
                        </a>
                      </span>
                    ))}
                  </span>
                </span>
                <span className="stats-value stats-value--niche">{item.track.popularity}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Top Artists */}
        <div className="stats-section">
          <div className="stats-header">
            <h3>Top 20 Artists</h3>
            <div className="stats-sort">
              <button
                className={`stats-sort-btn ${artistSort === 'count' ? 'stats-sort-btn--active' : ''}`}
                onClick={() => setArtistSort('count')}
              >
                Tracks
              </button>
              <button
                className={`stats-sort-btn ${artistSort === 'popularity' ? 'stats-sort-btn--active' : ''}`}
                onClick={() => setArtistSort('popularity')}
              >
                Popularity
              </button>
            </div>
          </div>
          <ol className="stats-list stats-list--numbered">
            {topArtists.map((artist) => (
              <li key={artist.id}>
                <span className="stats-track">
                  <a
                    href={`https://open.spotify.com/artist/${artist.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="stats-link"
                  >
                    <strong>{artist.name}</strong>
                  </a>
                  <span className="stats-artist">({artist.years.join(', ')})</span>
                </span>
                <span className="stats-value">
                  {artist.count} · <span className="stats-popularity">{artist.avgPopularity}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Genre Breakdown */}
        <div className="stats-section">
          <div className="stats-header">
            <h3>Top 20 Genres</h3>
            <div className="stats-sort">
              <button
                className={`stats-sort-btn ${genreSort === 'count' ? 'stats-sort-btn--active' : ''}`}
                onClick={() => setGenreSort('count')}
              >
                Tracks
              </button>
              <button
                className={`stats-sort-btn ${genreSort === 'popularity' ? 'stats-sort-btn--active' : ''}`}
                onClick={() => setGenreSort('popularity')}
              >
                Popularity
              </button>
            </div>
          </div>
          {genreStats.length > 0 ? (
            <ol className="stats-list stats-list--numbered">
              {genreStats.map((g, i) => (
                <li key={i}>
                  <span className="stats-track">
                    <strong>{toTitleCase(g.genre)}</strong>
                    <span className="stats-artist">({g.years.join(', ')})</span>
                  </span>
                  <span className="stats-value">
                    {g.count} · <span className="stats-popularity">{g.avgPopularity}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="stats-loading">Loading genre data...</p>
          )}
        </div>
      </div>

      {/* Yearly Summary */}
      <div className="stats-yearly">
        <h3>Yearly Summary</h3>
        <div className="stats-yearly-wrapper">
          <table className="stats-yearly-table">
            <thead>
              <tr>
                <th className="stats-yearly-label">Year</th>
                {yearlySummary.map((y) => {
                  // Collect all highlights for this year
                  const highlights = [];
                  if (y.countRank === 1)
                    highlights.push({
                      color: cssColors.highlightBusiest,
                      title: 'Most tracks added',
                    });
                  if (y.growthRank === 1 && y.growth > 0)
                    highlights.push({
                      color: cssColors.highlightGrowth,
                      title: `Largest YoY increase (+${y.growth})`,
                    });
                  if (y.popRank === 1)
                    highlights.push({
                      color: cssColors.highlightPopular,
                      title: 'Most popular',
                    });
                  if (y.lowPopRank === 1 && yearlySummary.length > 1)
                    highlights.push({
                      color: cssColors.highlightNiche,
                      title: 'Most niche',
                    });

                  const yearColor = highlights.length > 0 ? highlights[0].color : undefined;
                  const yearTitle = highlights.map((h) => h.title).join(', ');

                  return (
                    <th
                      key={y.year}
                      style={yearColor ? { color: yearColor } : undefined}
                      title={yearTitle || undefined}
                    >
                      {y.year}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="stats-yearly-label">Tracks Added</td>
                {yearlySummary.map((y) => {
                  const highlights = [];
                  if (y.countRank === 1) highlights.push(cssColors.highlightBusiest);
                  if (y.growthRank === 1 && y.growth > 0)
                    highlights.push(cssColors.highlightGrowth);
                  const bgColor = highlights[0] ? `${highlights[0]}15` : undefined;
                  return (
                    <td key={y.year} style={bgColor ? { backgroundColor: bgColor } : undefined}>
                      {y.count}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="stats-yearly-label">Avg Popularity</td>
                {yearlySummary.map((y) => {
                  const highlights = [];
                  if (y.popRank === 1) highlights.push(cssColors.highlightPopular);
                  if (y.lowPopRank === 1 && yearlySummary.length > 1)
                    highlights.push(cssColors.highlightNiche);
                  const bgColor = highlights[0] ? `${highlights[0]}15` : undefined;
                  return (
                    <td key={y.year} style={bgColor ? { backgroundColor: bgColor } : undefined}>
                      {y.avgPopularity}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          <div className="stats-yearly-legend">
            <span className="legend-item">
              <span
                className="indicator-sample"
                style={{ backgroundColor: cssColors.highlightBusiest }}
              />
              Most tracks
            </span>
            <span className="legend-item">
              <span
                className="indicator-sample"
                style={{ backgroundColor: cssColors.highlightGrowth }}
              />
              Largest YoY increase
            </span>
            <span className="legend-item">
              <span
                className="indicator-sample"
                style={{ backgroundColor: cssColors.highlightPopular }}
              />
              Most popular
            </span>
            <span className="legend-item">
              <span
                className="indicator-sample"
                style={{ backgroundColor: cssColors.highlightNiche }}
              />
              Most niche
            </span>
          </div>
        </div>
      </div>

      {/* Activity Heatmap */}
      {heatmapYearsSorted.length > 0 && (
        <div className="stats-heatmap">
          <div className="heatmap-header">
            <h3>Your Liked Songs Heatmap</h3>
            {/* Legend - top right aligned with title */}
            <div className="heatmap-legend">
              <span className="heatmap-legend-label">Less</span>
              <div className="heatmap-legend-cells">
                <div
                  className="heatmap-legend-cell"
                  style={{ backgroundColor: QUARTER_GREYS[0] }}
                />
                <div className="heatmap-legend-cell" style={{ backgroundColor: '#1a4d2e' }} />
                <div
                  className="heatmap-legend-cell"
                  style={{
                    backgroundColor: interpolateRgb(
                      '#1a4d2e',
                      cssColors.spotifyGreen
                    )(Math.sqrt(0.33)),
                  }}
                />
                <div
                  className="heatmap-legend-cell"
                  style={{
                    backgroundColor: interpolateRgb(
                      '#1a4d2e',
                      cssColors.spotifyGreen
                    )(Math.sqrt(0.67)),
                  }}
                />
                <div
                  className="heatmap-legend-cell"
                  style={{ backgroundColor: cssColors.spotifyGreen }}
                />
              </div>
              <span className="heatmap-legend-label">More</span>
            </div>
          </div>
          <div className="heatmap-layout">
            {/* Stacked years */}
            <div className="heatmap-years-stack">
              {heatmapYearsSorted.map((yearData) => (
                <div key={yearData.year} className="heatmap-year-row">
                  {/* Year label - centered above grid */}
                  <div className="heatmap-year-label">{yearData.year}</div>

                  {/* Day labels - horizontal (S M T W T F S) */}
                  <div className="heatmap-day-labels">
                    <span>S</span>
                    <span>M</span>
                    <span>T</span>
                    <span>W</span>
                    <span>T</span>
                    <span>F</span>
                    <span>S</span>
                  </div>

                  {/* Grid of cells - vertical layout (weeks as rows) */}
                  <div className="heatmap-grid">
                    {yearData.weeks.flatMap((week, weekIndex) =>
                      week.map((day, dayIndex) => (
                        <div
                          key={`${yearData.year}-${weekIndex}-${dayIndex}`}
                          className={`heatmap-cell ${day.count < 0 ? 'heatmap-cell--empty' : ''}`}
                          style={{
                            backgroundColor:
                              day.count >= 0
                                ? getHeatmapColor(
                                    day.count,
                                    globalHeatmapRange.minCount,
                                    globalHeatmapRange.maxCount,
                                    day.date?.getMonth()
                                  )
                                : 'transparent',
                            gridRow: weekIndex + 1,
                            gridColumn: day.dayOfWeek + 1,
                          }}
                          onMouseEnter={(e) => {
                            if (day.date && day.count >= 0) {
                              setHeatmapTooltip({
                                date: day.date,
                                count: day.count,
                                x: e.clientX + 10,
                                y: e.clientY - 30,
                              });
                            }
                          }}
                          onMouseLeave={() => setHeatmapTooltip(null)}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tooltip */}
          {heatmapTooltip && (
            <div
              className="heatmap-tooltip"
              style={{ left: heatmapTooltip.x, top: heatmapTooltip.y }}
            >
              <span className="heatmap-tooltip-count">
                {heatmapTooltip.count} track{heatmapTooltip.count !== 1 ? 's' : ''}
              </span>
              {' on '}
              {heatmapTooltip.date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Stats;
