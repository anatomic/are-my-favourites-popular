import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import type { StatsProps, SavedTrack, SpotifyArtist } from '../types/spotify';
import './stats.css';

// Convert string to title case
function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, char => char.toUpperCase());
}

// Internal types for stats calculations
interface ArtistStats {
  id: string;
  name: string;
  count: number;
  totalPop: number;
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

// Spotify secondary brand colors for highlights
const HIGHLIGHT_COLORS = {
  busiest: '#FF9E95',    // Coral - most tracks added
  popular: '#B388FF',    // Light purple - highest avg popularity
  niche: '#1DB954',      // Spotify Green - lowest avg popularity (most niche)
  growth: '#F59B23',     // Amber - biggest growth year
};

function Stats({ tracks, artistMap, onPlayTrack }: StatsProps): ReactElement {

  // Top 20 most popular songs
  const top20Popular = useMemo((): SavedTrack[] => {
    return [...tracks]
      .sort((a, b) => b.track.popularity - a.track.popularity)
      .slice(0, 20);
  }, [tracks]);

  // Top 20 most niche songs (lowest popularity)
  const top20Niche = useMemo((): SavedTrack[] => {
    return [...tracks]
      .sort((a, b) => a.track.popularity - b.track.popularity)
      .slice(0, 20);
  }, [tracks]);

  // Sort state for artists and genres
  const [artistSort, setArtistSort] = useState<SortMode>('count');
  const [genreSort, setGenreSort] = useState<SortMode>('count');

  // Top 20 artists by track count (with avg popularity)
  const topArtists = useMemo((): ArtistStatsWithAvg[] => {
    const counts: Record<string, ArtistStats> = {};
    tracks.forEach((t: SavedTrack) => {
      const year = new Date(t.added_at).getFullYear();
      t.track.artists.forEach((a: SpotifyArtist) => {
        if (!counts[a.id]) {
          counts[a.id] = { id: a.id, name: a.name, count: 0, totalPop: 0, years: new Set() };
        }
        counts[a.id].count++;
        counts[a.id].totalPop += t.track.popularity;
        counts[a.id].years.add(year);
      });
    });
    return Object.values(counts)
      .map((a: ArtistStats): ArtistStatsWithAvg => ({
        id: a.id,
        name: a.name,
        count: a.count,
        avgPopularity: Math.round(a.totalPop / a.count),
        years: [...a.years].sort((x, y) => x - y),
      }))
      .sort((a, b) => artistSort === 'popularity'
        ? b.avgPopularity - a.avgPopularity
        : b.count - a.count)
      .slice(0, 20);
  }, [tracks, artistSort]);

  // Genre breakdown (only if artistMap is loaded)
  const genreStats = useMemo((): GenreStats[] => {
    if (!artistMap || artistMap.size === 0) return [];

    const stats: Record<string, { count: number; totalPop: number; years: Set<number> }> = {};
    tracks.forEach((t: SavedTrack) => {
      const year = new Date(t.added_at).getFullYear();
      t.track.artists.forEach((a: SpotifyArtist) => {
        const artist = artistMap.get(a.id);
        if (artist?.genres) {
          artist.genres.forEach((genre: string) => {
            if (!stats[genre]) {
              stats[genre] = { count: 0, totalPop: 0, years: new Set() };
            }
            stats[genre].count++;
            stats[genre].totalPop += t.track.popularity;
            stats[genre].years.add(year);
          });
        }
      });
    });

    return Object.entries(stats)
      .map(([genre, data]): GenreStats => ({
        genre,
        count: data.count,
        avgPopularity: Math.round(data.totalPop / data.count),
        years: [...data.years].sort((x, y) => x - y),
      }))
      .sort((a, b) => genreSort === 'popularity'
        ? b.avgPopularity - a.avgPopularity
        : b.count - a.count)
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
    return withGrowth.map((y): YearlySummaryItem => ({
      ...y,
      countRank: sortedByCount.findIndex(s => s.year === y.year) + 1,
      popRank: sortedByPop.findIndex(s => s.year === y.year) + 1,
      lowPopRank: sortedByLowPop.findIndex(s => s.year === y.year) + 1,
      growthRank: y.growth > 0 ? sortedByGrowth.findIndex(s => s.year === y.year) + 1 : 999,
    }));
  }, [tracks]);

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
                  <span className="stats-artist">
                    ({artist.years.join(', ')})
                  </span>
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
                    <span className="stats-artist">
                      ({g.years.join(', ')})
                    </span>
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
                {yearlySummary.map(y => {
                  // Collect all highlights for this year
                  const highlights = [];
                  if (y.countRank === 1) highlights.push({ color: HIGHLIGHT_COLORS.busiest, title: 'Most tracks added' });
                  if (y.growthRank === 1 && y.growth > 0) highlights.push({ color: HIGHLIGHT_COLORS.growth, title: `Biggest growth (+${y.growth})` });
                  if (y.popRank === 1) highlights.push({ color: HIGHLIGHT_COLORS.popular, title: 'Most popular' });
                  if (y.lowPopRank === 1 && yearlySummary.length > 1) highlights.push({ color: HIGHLIGHT_COLORS.niche, title: 'Most niche' });

                  const yearColor = highlights.length > 0 ? highlights[0].color : undefined;
                  const yearTitle = highlights.map(h => h.title).join(', ');

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
                {yearlySummary.map(y => {
                  const highlights = [];
                  if (y.countRank === 1) highlights.push(HIGHLIGHT_COLORS.busiest);
                  if (y.growthRank === 1 && y.growth > 0) highlights.push(HIGHLIGHT_COLORS.growth);
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
                {yearlySummary.map(y => {
                  const highlights = [];
                  if (y.popRank === 1) highlights.push(HIGHLIGHT_COLORS.popular);
                  if (y.lowPopRank === 1 && yearlySummary.length > 1) highlights.push(HIGHLIGHT_COLORS.niche);
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
              <span className="indicator-sample" style={{ backgroundColor: HIGHLIGHT_COLORS.busiest }} />
              Most tracks
            </span>
            <span className="legend-item">
              <span className="indicator-sample" style={{ backgroundColor: HIGHLIGHT_COLORS.growth }} />
              Biggest growth
            </span>
            <span className="legend-item">
              <span className="indicator-sample" style={{ backgroundColor: HIGHLIGHT_COLORS.popular }} />
              Most popular
            </span>
            <span className="legend-item">
              <span className="indicator-sample" style={{ backgroundColor: HIGHLIGHT_COLORS.niche }} />
              Most niche
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Stats;
