import { useMemo } from 'react';
import { rollup } from 'd3-array';
import { timeWeek, timeMonth, timeYear } from 'd3-time';
import './stats.css';

function Stats({ tracks, artistMap, bucket }) {
  const timeInterval = useMemo(() => {
    switch (bucket) {
      case 'week': return timeWeek;
      case 'month': return timeMonth;
      case 'year': return timeYear;
      default: return timeMonth;
    }
  }, [bucket]);

  // Top 20 most popular songs
  const top20Popular = useMemo(() => {
    return [...tracks]
      .sort((a, b) => b.track.popularity - a.track.popularity)
      .slice(0, 20);
  }, [tracks]);

  // Top 20 artists by track count
  const topArtists = useMemo(() => {
    const counts = {};
    tracks.forEach(t => {
      t.track.artists.forEach(a => {
        if (!counts[a.id]) {
          counts[a.id] = { id: a.id, name: a.name, count: 0 };
        }
        counts[a.id].count++;
      });
    });
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [tracks]);

  // Genre breakdown (only if artistMap is loaded)
  const genreStats = useMemo(() => {
    if (!artistMap || artistMap.size === 0) return [];

    const stats = {};
    tracks.forEach(t => {
      t.track.artists.forEach(a => {
        const artist = artistMap.get(a.id);
        if (artist?.genres) {
          artist.genres.forEach(genre => {
            if (!stats[genre]) {
              stats[genre] = { count: 0, totalPop: 0 };
            }
            stats[genre].count++;
            stats[genre].totalPop += t.track.popularity;
          });
        }
      });
    });

    return Object.entries(stats)
      .map(([genre, data]) => ({
        genre,
        count: data.count,
        avgPopularity: Math.round(data.totalPop / data.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [tracks, artistMap]);

  // Top 20 time buckets by volume
  const topBuckets = useMemo(() => {
    const grouped = rollup(
      tracks,
      (leaves) => leaves.length,
      (d) => timeInterval(new Date(d.added_at)).toISOString()
    );

    const bucketLabel = bucket === 'week' ? 'Week of' : bucket === 'month' ? 'Month of' : 'Year';

    return Array.from(grouped, ([key, count]) => ({
      date: new Date(key),
      count,
      label: bucketLabel,
    }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [tracks, timeInterval, bucket]);

  // Yearly summary - totals and avg popularity by year (ascending)
  const yearlySummary = useMemo(() => {
    const byYear = {};
    tracks.forEach(t => {
      const year = new Date(t.added_at).getFullYear();
      if (!byYear[year]) {
        byYear[year] = { count: 0, totalPop: 0 };
      }
      byYear[year].count++;
      byYear[year].totalPop += t.track.popularity;
    });

    return Object.entries(byYear)
      .map(([year, data]) => ({
        year: parseInt(year),
        count: data.count,
        avgPopularity: Math.round(data.totalPop / data.count),
      }))
      .sort((a, b) => a.year - b.year);
  }, [tracks]);

  const formatDate = (date) => {
    if (bucket === 'year') {
      return date.getFullYear().toString();
    } else if (bucket === 'month') {
      return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    } else {
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  };

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
                  <a
                    href={`https://open.spotify.com/track/${item.track.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="stats-link"
                  >
                    <strong>{item.track.name}</strong>
                  </a>
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

        {/* Top Artists */}
        <div className="stats-section">
          <h3>Top 20 Artists</h3>
          <ol className="stats-list stats-list--numbered">
            {topArtists.map((artist) => (
              <li key={artist.id}>
                <a
                  href={`https://open.spotify.com/artist/${artist.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="stats-link stats-name"
                >
                  {artist.name}
                </a>
                <span className="stats-value">{artist.count} track{artist.count !== 1 ? 's' : ''}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Genre Breakdown */}
        <div className="stats-section">
          <h3>Top 20 Genres</h3>
          {genreStats.length > 0 ? (
            <ol className="stats-list stats-list--numbered">
              {genreStats.map((g, i) => (
                <li key={i}>
                  <span className="stats-name">{g.genre}</span>
                  <span className="stats-value">
                    {g.count} track{g.count !== 1 ? 's' : ''} · avg {g.avgPopularity}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="stats-loading">Loading genre data...</p>
          )}
        </div>

        {/* Top Time Buckets */}
        <div className="stats-section">
          <h3>Top 20 Busiest Periods</h3>
          <ol className="stats-list stats-list--numbered">
            {topBuckets.map((b, i) => (
              <li key={i}>
                <span className="stats-name">{formatDate(b.date)}</span>
                <span className="stats-value">{b.count} track{b.count !== 1 ? 's' : ''}</span>
              </li>
            ))}
          </ol>
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
                {yearlySummary.map(y => (
                  <th key={y.year}>{y.year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="stats-yearly-label">Tracks Added</td>
                {yearlySummary.map(y => (
                  <td key={y.year}>{y.count}</td>
                ))}
              </tr>
              <tr>
                <td className="stats-yearly-label">Avg Popularity</td>
                {yearlySummary.map(y => (
                  <td key={y.year}>{y.avgPopularity}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Stats;
