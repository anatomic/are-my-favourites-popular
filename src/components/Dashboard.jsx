import { useEffect, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { rollup, sum, min, max, mean } from 'd3-array';
import { scalePow, scaleTime, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { line, area, curveBasis } from 'd3-shape';
import { timeWeek, timeMonth, timeYear } from 'd3-time';
import Stats from './Stats';
import './dashboard.css';
import './graph.css';

// Design system colors
const COLORS = {
  green: '#1DB954',
  greenLight: '#1ED760',
  greenArea: 'rgba(29, 185, 84, 0.08)',
  greenLine: 'rgba(29, 185, 84, 0.5)',
  orange: '#F59B23',
  muted: '#535353',
  text: '#B3B3B3',
};

function Dashboard({ tracks, artistMap, onLogout }) {
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const [bucket, setBucket] = useState('month');
  const maxWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 80, 1400) : 800;
  const maxHeight = typeof window !== 'undefined' ? Math.min(window.innerHeight - 280, 500) : 400;

  const getTimeInterval = (b) => {
    switch (b) {
      case 'week': return timeWeek;
      case 'month': return timeMonth;
      case 'year': return timeYear;
      default: return timeMonth;
    }
  };

  useEffect(() => {
    if (!tracks || !svgRef.current) return;

    // Clear previous chart
    select(svgRef.current).selectAll('*').remove();

    const sortedTracks = [...tracks].sort(
      (a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
    );

    const container = svgRef.current;

    // Group tracks by selected time interval and calculate popularity metrics
    const timeInterval = getTimeInterval(bucket);
    const grouped = rollup(
      sortedTracks,
      (leaves) => ({
        total_popularity: sum(leaves, (d) => d.track.popularity),
        total_tracks: leaves.length,
      }),
      (d) => timeInterval(new Date(d.added_at)).toISOString()
    );

    // Convert to array and calculate cumulative values
    const cumulativePopularity = Array.from(grouped, ([key, values]) => ({
      key,
      values,
    })).sort((a, b) => new Date(a.key) - new Date(b.key));

    let runningSum = 0;
    let totalTracks = 0;
    cumulativePopularity.forEach((leaf) => {
      runningSum += leaf.values.total_popularity;
      totalTracks += leaf.values.total_tracks;
      leaf.values.cumulative_total = runningSum;
      leaf.values.moving_mean = totalTracks && runningSum ? runningSum / totalTracks : runningSum;
      leaf.values.mean = leaf.values.total_popularity / leaf.values.total_tracks;
    });

    // Scales
    const first = min(sortedTracks, (d) => new Date(d.added_at));
    const last = max(sortedTracks, (d) => new Date(d.added_at));

    const r = scalePow().exponent(2).domain([0, 100]).range([2, 16]);
    const x = scaleTime().domain([first, last]).range([50, maxWidth - 20]).nice();
    const y = scaleLinear()
      .domain([max(sortedTracks, (d) => d.track.popularity) + 5, 0])
      .range([30, maxHeight]);

    // Axes - adjust tick frequency based on bucket
    const tickInterval = bucket === 'week' ? timeWeek.every(2)
      : bucket === 'month' ? timeMonth.every(1)
      : timeYear.every(1);
    const xAxis = axisBottom(x).ticks(tickInterval);
    const yAxis = axisLeft(y).ticks(5);

    const av = mean(sortedTracks, (d) => d.track.popularity);

    // Line generators
    const cumulativeLine = line()
      .curve(curveBasis)
      .x((d) => x(new Date(d.key)))
      .y((d) => y(d.values.moving_mean));

    const weeklyMeanLine = line()
      .curve(curveBasis)
      .x((d) => x(new Date(d.key)))
      .y((d) => y(d.values.mean));

    const cumulativeArea = area()
      .curve(curveBasis)
      .x((d) => x(new Date(d.key)))
      .y1((d) => y(d.values.moving_mean))
      .y0(maxHeight);

    const svg = select(container);

    // Draw cumulative area
    svg
      .append('path')
      .attr('d', cumulativeArea(cumulativePopularity))
      .attr('fill', COLORS.greenArea);

    // Draw cumulative line
    svg
      .append('path')
      .attr('d', cumulativeLine(cumulativePopularity))
      .attr('fill', 'none')
      .attr('stroke', COLORS.green)
      .attr('stroke-width', '2px')
      .attr('opacity', 0.6)
      .attr('id', 'cumulativeTotal');

    // Draw weekly mean line
    svg
      .append('path')
      .attr('d', weeklyMeanLine(cumulativePopularity))
      .attr('fill', 'none')
      .attr('stroke', COLORS.muted)
      .attr('stroke-dasharray', '4,4')
      .attr('opacity', 0.6);

    // Moving average label
    const text = svg
      .append('text')
      .attr('dy', -6)
      .attr('dx', maxWidth * 0.6)
      .attr('text-anchor', 'end')
      .attr('x', 10)
      .attr('class', 'line-label');
    text
      .append('textPath')
      .attr('href', '#cumulativeTotal')
      .attr('text-anchor', 'end')
      .text('Moving Average');

    // Axes
    svg
      .append('g')
      .attr('transform', `translate(0,${maxHeight})`)
      .call(xAxis);
    svg.append('g').attr('transform', 'translate(50,0)').call(yAxis);

    // Data points with Spotify green gradient
    svg
      .selectAll('circle')
      .data(sortedTracks)
      .enter()
      .append('circle')
      .attr('r', (d) => r(d.track.popularity))
      .attr('cx', (d) => x(new Date(d.added_at)))
      .attr('cy', (d) => y(d.track.popularity))
      .attr('fill', COLORS.green)
      .attr('opacity', 0.7)
      .style('cursor', 'pointer')
      .on('mousedown', function (event, d) {
        select(this).attr('fill', COLORS.greenLight);
        if (d.track.preview_url) {
          d.audio = new Audio(d.track.preview_url);
          d.audio.play();
        }
      })
      .on('mouseup', function (event, d) {
        select(this).attr('fill', COLORS.green);
        if (d.audio) {
          d.audio.pause();
        }
      })
      .on('mouseover', function (event, d) {
        select(this)
          .attr('opacity', 1)
          .attr('r', r(d.track.popularity) * 1.3);
        const tooltip = tooltipRef.current;
        if (tooltip) {
          const addedDate = new Date(d.added_at).toLocaleDateString();
          tooltip.innerHTML = `
            <strong>${d.track.name}</strong>
            ${d.track.artists.map(a => a.name).join(', ')}<br/>
            <em>${d.track.album.name}</em><br/>
            <span class="tooltip-stat">Popularity: <span class="text-green">${d.track.popularity}</span></span>
            <span class="tooltip-stat">Added: ${addedDate}</span>
          `;
          tooltip.style.opacity = '1';
          tooltip.style.left = `${event.pageX + 15}px`;
          tooltip.style.top = `${event.pageY - 10}px`;
        }
      })
      .on('mouseout', function (event, d) {
        select(this)
          .attr('opacity', 0.7)
          .attr('r', r(d.track.popularity));
        const tooltip = tooltipRef.current;
        if (tooltip) {
          tooltip.style.opacity = '0';
        }
      });

    // Average line
    svg
      .append('line')
      .attr('x1', 50)
      .attr('x2', maxWidth - 20)
      .attr('y1', y(av))
      .attr('y2', y(av))
      .attr('stroke', COLORS.orange)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '6,4')
      .attr('opacity', 0.8);

    svg
      .append('text')
      .attr('x', 54)
      .attr('y', y(av))
      .attr('dy', -6)
      .attr('class', 'line-label line-label--highlight')
      .text(`Average: ${av.toFixed(1)}`);
  }, [tracks, maxWidth, maxHeight, bucket]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Are my favourites <span className="text-green">popular?</span></h1>
        <p className="subtitle">Popularity scores reflect current streaming activity, not when you added each track</p>
      </header>

      <div className="bucket-controls">
        <span>Group by:</span>
        <button
          onClick={() => setBucket('week')}
          className={`btn btn--bucket ${bucket === 'week' ? 'btn--active' : ''}`}
        >
          Week
        </button>
        <button
          onClick={() => setBucket('month')}
          className={`btn btn--bucket ${bucket === 'month' ? 'btn--active' : ''}`}
        >
          Month
        </button>
        <button
          onClick={() => setBucket('year')}
          className={`btn btn--bucket ${bucket === 'year' ? 'btn--active' : ''}`}
        >
          Year
        </button>
      </div>

      {tracks ? (
        <div className="chart-wrapper">
          <svg ref={svgRef} width="100%" height={maxHeight + 60}></svg>
          <div ref={tooltipRef} className="tooltip"></div>
        </div>
      ) : (
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Loading your tracks...</p>
        </div>
      )}

      {tracks && <Stats tracks={tracks} artistMap={artistMap} bucket={bucket} />}

      <footer className="dashboard-footer">
        <button onClick={onLogout} className="btn btn--secondary">
          Log out
        </button>
      </footer>
    </div>
  );
}

export default Dashboard;
