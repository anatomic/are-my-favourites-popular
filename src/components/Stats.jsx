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

  // Top 10 artists by track count
  const topArtists = useMemo(() => {
    const counts = {};
    tracks.forEach(t => {
      t.track.artists.forEach(a => {
        counts[a.name] = (counts[a.name] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
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
      .slice(0, 15);
  }, [tracks, artistMap]);

  // Top 5 time buckets by volume
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
      .slice(0, 5);
  }, [tracks, timeInterval, bucket]);

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
                  <strong>{item.track.name}</strong>
                  <span className="stats-artist">{item.track.artists.map(a => a.name).join(', ')}</span>
                </span>
                <span className="stats-value">{item.track.popularity}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Top Artists */}
        <div className="stats-section">
          <h3>Top Artists</h3>
          <ol className="stats-list stats-list--numbered">
            {topArtists.map(([name, count], i) => (
              <li key={i}>
                <span className="stats-name">{name}</span>
                <span className="stats-value">{count} track{count !== 1 ? 's' : ''}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Genre Breakdown */}
        <div className="stats-section">
          <h3>Top Genres</h3>
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
          <h3>Busiest Periods</h3>
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
    </div>
  );
}

export default Stats;
