import { useEffect, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { rollup, sum, min, max, mean } from 'd3-array';
import { scalePow, scaleTime, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { line, curveBasis } from 'd3-shape';
import { timeWeek, timeMonth, timeYear } from 'd3-time';
import { interpolateRgb } from 'd3-interpolate';
import Stats from './Stats';
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

function Dashboard({ tracks, artistMap, onLogout }) {
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const [bucket, setBucket] = useState('year');
  const maxWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 80, 1400) : 800;
  const maxHeight = typeof window !== 'undefined' ? Math.min(window.innerHeight - 280, 500) : 400;

  // Chart margins
  const margin = { top: 40, right: 30, bottom: 50, left: 60 };
  const chartWidth = maxWidth - margin.left - margin.right;
  const chartHeight = maxHeight - margin.top - margin.bottom;

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

    // Group tracks by week for moving average (always weekly for finer granularity)
    const grouped = rollup(
      sortedTracks,
      (leaves) => ({
        total_popularity: sum(leaves, (d) => d.track.popularity),
        total_tracks: leaves.length,
      }),
      (d) => timeWeek(new Date(d.added_at)).toISOString()
    );

    // Calculate cumulative values for moving average
    const cumulativePopularity = Array.from(grouped, ([key, values]) => ({
      key,
      values,
    })).sort((a, b) => new Date(a.key) - new Date(b.key));

    let runningSum = 0;
    let totalTracks = 0;
    cumulativePopularity.forEach((leaf) => {
      runningSum += leaf.values.total_popularity;
      totalTracks += leaf.values.total_tracks;
      leaf.values.moving_mean = totalTracks && runningSum ? runningSum / totalTracks : runningSum;
    });

    // Scales
    const first = min(sortedTracks, (d) => new Date(d.added_at));
    const last = max(sortedTracks, (d) => new Date(d.added_at));
    const maxPop = max(sortedTracks, (d) => d.track.popularity);

    const r = scalePow().exponent(1.5).domain([0, 100]).range([3, 14]);
    const x = scaleTime()
      .domain([first, last])
      .range([margin.left, maxWidth - margin.right])
      .nice();
    const y = scaleLinear()
      .domain([0, Math.ceil(maxPop / 10) * 10]) // Round up to nearest 10
      .range([maxHeight - margin.bottom, margin.top]);

    // Color scale based on popularity
    const colorScale = (popularity) => {
      const t = popularity / 100;
      return interpolateRgb(GRADIENT.low, GRADIENT.high)(t);
    };

    // Axes
    const tickInterval = bucket === 'week' ? timeWeek.every(4)
      : bucket === 'month' ? timeMonth.every(3)
      : timeYear.every(1);
    const xAxis = axisBottom(x).ticks(tickInterval);
    const yAxis = axisLeft(y).ticks(5);

    const av = mean(sortedTracks, (d) => d.track.popularity);

    // Moving average line generator
    const movingAvgLine = line()
      .curve(curveBasis)
      .x((d) => x(new Date(d.key)))
      .y((d) => y(d.values.moving_mean));

    // Draw horizontal grid lines
    const gridLines = [20, 40, 60, 80, 100].filter(v => v <= Math.ceil(maxPop / 10) * 10);
    svg.selectAll('.grid-line')
      .data(gridLines)
      .enter()
      .append('line')
      .attr('class', 'grid-line')
      .attr('x1', margin.left)
      .attr('x2', maxWidth - margin.right)
      .attr('y1', d => y(d))
      .attr('y2', d => y(d))
      .attr('stroke', COLORS.grid)
      .attr('stroke-width', 1);

    // Draw moving average line
    svg
      .append('path')
      .attr('d', movingAvgLine(cumulativePopularity))
      .attr('fill', 'none')
      .attr('stroke', COLORS.text)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '6,4')
      .attr('opacity', 0.5);

    // Draw average line
    svg
      .append('line')
      .attr('x1', margin.left)
      .attr('x2', maxWidth - margin.right)
      .attr('y1', y(av))
      .attr('y2', y(av))
      .attr('stroke', COLORS.green)
      .attr('stroke-width', 2)
      .attr('opacity', 0.8);

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

    // Data points colored by popularity
    svg
      .selectAll('circle')
      .data(sortedTracks)
      .enter()
      .append('circle')
      .attr('r', (d) => r(d.track.popularity))
      .attr('cx', (d) => x(new Date(d.added_at)))
      .attr('cy', (d) => y(d.track.popularity))
      .attr('fill', (d) => colorScale(d.track.popularity))
      .attr('opacity', 0.75)
      .attr('stroke', 'rgba(0,0,0,0.2)')
      .attr('stroke-width', 0.5)
      .style('cursor', 'pointer')
      .on('mousedown', function (event, d) {
        select(this).attr('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 2);
        if (d.track.preview_url) {
          d.audio = new Audio(d.track.preview_url);
          d.audio.play();
        }
      })
      .on('mouseup', function (event, d) {
        select(this).attr('opacity', 0.75).attr('stroke', 'rgba(0,0,0,0.2)').attr('stroke-width', 0.5);
        if (d.audio) {
          d.audio.pause();
        }
      })
      .on('mouseover', function (event, d) {
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
      .on('mouseout', function (event, d) {
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
    const legendX = maxWidth - margin.right - 160;
    const legendY = margin.top;

    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${legendX}, ${legendY})`);

    // Legend background
    legend.append('rect')
      .attr('x', -12)
      .attr('y', -12)
      .attr('width', 170)
      .attr('height', 90)
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

    // Average line legend
    legend.append('line')
      .attr('x1', 0)
      .attr('x2', 24)
      .attr('y1', 56)
      .attr('y2', 56)
      .attr('stroke', COLORS.green)
      .attr('stroke-width', 2);
    legend.append('text')
      .attr('x', 30)
      .attr('y', 60)
      .attr('class', 'legend-label')
      .text(`Average: ${av.toFixed(0)}`);

  }, [tracks, maxWidth, maxHeight, bucket, margin.left, margin.right, margin.top, margin.bottom, chartWidth, chartHeight]);

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
          <svg ref={svgRef} width="100%" height={maxHeight}></svg>
          <div ref={tooltipRef} className="tooltip"></div>
        </div>
      ) : (
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Loading your tracks...</p>
        </div>
      )}

      {tracks && <Stats tracks={tracks} artistMap={artistMap} />}

      <footer className="dashboard-footer">
        <button onClick={onLogout} className="btn btn--secondary">
          Log out
        </button>
        <div className="attribution">
          Made by{' '}
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
      </footer>
    </div>
  );
}

export default Dashboard;
