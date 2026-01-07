import { useEffect, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { rollup, sum, min, max, mean } from 'd3-array';
import { scalePow, scaleTime, scaleLinear, scaleOrdinal } from 'd3-scale';
import { schemeCategory10 } from 'd3-scale-chromatic';
import { axisBottom, axisLeft } from 'd3-axis';
import { line, area, curveBasis } from 'd3-shape';
import { timeWeek, timeMonth, timeYear } from 'd3-time';
import './graph.css';
import './playlists.css';

function Dashboard({ tracks, onLogout }) {
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const [bucket, setBucket] = useState('month');
  const maxWidth = typeof window !== 'undefined' ? window.innerWidth - 100 : 800;
  const maxHeight = typeof window !== 'undefined' ? window.innerHeight - 200 : 400;

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

    const r = scalePow().exponent(2).domain([0, 100]).range([1, 20]);
    const x = scaleTime().domain([first, last]).range([40, maxWidth]).nice();
    const y = scaleLinear()
      .domain([max(sortedTracks, (d) => d.track.popularity) + 5, 0])
      .range([20, maxHeight]);
    const col = scaleOrdinal(schemeCategory10);

    // Axes - adjust tick frequency based on bucket
    const tickInterval = bucket === 'week' ? timeWeek.every(2)
      : bucket === 'month' ? timeMonth.every(1)
      : timeYear.every(1);
    const xAxis = axisBottom(x).ticks(tickInterval);
    const yAxis = axisLeft(y);

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
      .attr('fill', '#74C476')
      .attr('opacity', 0.05);

    // Draw cumulative line
    svg
      .append('path')
      .attr('d', cumulativeLine(cumulativePopularity))
      .attr('fill', 'none')
      .attr('stroke', '#74C476')
      .attr('stroke-width', '2px')
      .attr('opacity', 0.4)
      .attr('id', 'cumulativeTotal');

    // Draw weekly mean line
    svg
      .append('path')
      .attr('d', weeklyMeanLine(cumulativePopularity))
      .attr('fill', 'none')
      .attr('stroke', '#ccc')
      .attr('stroke-dasharray', '3,5')
      .attr('opacity', 0.8);

    // Moving average label
    const text = svg
      .append('text')
      .attr('dy', -4)
      .attr('dx', maxWidth * 0.666)
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
    svg.append('g').attr('transform', 'translate(40,0)').call(yAxis);

    // Data points
    svg
      .selectAll('circle')
      .data(sortedTracks)
      .enter()
      .append('circle')
      .attr('r', (d) => r(d.track.popularity))
      .attr('cx', (d) => x(new Date(d.added_at)))
      .attr('cy', (d) => y(d.track.popularity))
      .attr('fill', (d, i) => col(i))
      .style('cursor', 'pointer')
      .on('mousedown', function (event, d) {
        if (d.track.preview_url) {
          d.audio = new Audio(d.track.preview_url);
          d.audio.play();
        }
      })
      .on('mouseup', function (event, d) {
        if (d.audio) {
          d.audio.pause();
        }
      })
      .on('mouseover', function (event, d) {
        const tooltip = tooltipRef.current;
        if (tooltip) {
          const addedDate = new Date(d.added_at).toLocaleDateString();
          tooltip.innerHTML = `
            <strong>${d.track.name}</strong><br/>
            ${d.track.artists.map(a => a.name).join(', ')}<br/>
            <em>${d.track.album.name}</em><br/>
            Current popularity: ${d.track.popularity}<br/>
            Added: ${addedDate}
          `;
          tooltip.style.opacity = '1';
          tooltip.style.left = `${event.pageX + 10}px`;
          tooltip.style.top = `${event.pageY - 10}px`;
        }
      })
      .on('mouseout', function () {
        const tooltip = tooltipRef.current;
        if (tooltip) {
          tooltip.style.opacity = '0';
        }
      });

    // Average line
    svg
      .append('line')
      .attr('x1', 40)
      .attr('x2', maxWidth)
      .attr('y1', y(av))
      .attr('y2', y(av))
      .attr('stroke', '#FDAE6B')
      .attr('stroke-dasharray', '3,3');

    svg
      .append('text')
      .attr('x', 40)
      .attr('y', y(av))
      .attr('dx', 4)
      .attr('dy', -4)
      .attr('class', 'line-label')
      .text(`Average current popularity: ${av.toFixed(2)}`);
  }, [tracks, maxWidth, maxHeight, bucket]);

  return (
    <div>
      <h1>Are my favourites popular?</h1>
      <p className="subtitle">Popularity scores reflect current streaming activity, not when you added each track</p>
      <div className="bucket-controls">
        <span>Group by: </span>
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
        <div style={{ position: 'relative' }}>
          <svg ref={svgRef} width="100%" height={maxHeight + 50}></svg>
          <div ref={tooltipRef} className="tooltip"></div>
        </div>
      ) : (
        <div>Loading Tracks</div>
      )}
      <button onClick={onLogout} className="btn btn--login">
        Log out
      </button>
    </div>
  );
}

export default Dashboard;
