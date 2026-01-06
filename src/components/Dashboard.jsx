import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import './graph.css';
import './playlists.css';

function Dashboard({ tracks, onLogout }) {
  const svgRef = useRef(null);
  const maxWidth = typeof window !== 'undefined' ? window.innerWidth - 100 : 800;
  const maxHeight = typeof window !== 'undefined' ? window.innerHeight - 200 : 400;

  useEffect(() => {
    if (!tracks || !svgRef.current) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const sortedTracks = [...tracks].sort(
      (a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
    );

    const container = svgRef.current;

    // Group tracks by week and calculate popularity metrics
    const grouped = d3.rollup(
      sortedTracks,
      (leaves) => ({
        total_popularity: d3.sum(leaves, (d) => d.track.popularity),
        total_tracks: leaves.length,
      }),
      (d) => d3.timeWeek(new Date(d.added_at)).toISOString()
    );

    // Convert to array and calculate cumulative values
    const cumulativePopularity = Array.from(grouped, ([key, values]) => ({
      key,
      values,
    })).sort((a, b) => new Date(a.key) - new Date(b.key));

    let sum = 0;
    let totalTracks = 0;
    cumulativePopularity.forEach((leaf) => {
      sum += leaf.values.total_popularity;
      totalTracks += leaf.values.total_tracks;
      leaf.values.cumulative_total = sum;
      leaf.values.moving_mean = totalTracks && sum ? sum / totalTracks : sum;
      leaf.values.mean = leaf.values.total_popularity / leaf.values.total_tracks;
    });

    // Scales
    const first = d3.min(sortedTracks, (d) => new Date(d.added_at));
    const last = d3.max(sortedTracks, (d) => new Date(d.added_at));

    const r = d3.scalePow().exponent(2).domain([0, 100]).range([1, 20]);
    const x = d3.scaleTime().domain([first, last]).range([40, maxWidth]).nice();
    const y = d3
      .scaleLinear()
      .domain([d3.max(sortedTracks, (d) => d.track.popularity) + 5, 0])
      .range([20, maxHeight]);
    const col = d3.scaleOrdinal(d3.schemeCategory10);

    // Axes
    const xAxis = d3.axisBottom(x).ticks(d3.timeWeek.every(2));
    const yAxis = d3.axisLeft(y);

    const av = d3.mean(sortedTracks, (d) => d.track.popularity);

    // Line generators
    const cumulativeLine = d3
      .line()
      .curve(d3.curveBasis)
      .x((d) => x(new Date(d.key)))
      .y((d) => y(d.values.moving_mean));

    const weeklyMeanLine = d3
      .line()
      .curve(d3.curveBasis)
      .x((d) => x(new Date(d.key)))
      .y((d) => y(d.values.mean));

    const cumulativeArea = d3
      .area()
      .curve(d3.curveBasis)
      .x((d) => x(new Date(d.key)))
      .y1((d) => y(d.values.moving_mean))
      .y0(maxHeight);

    const svg = d3.select(container);

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
      .attr('cx', (d) => x(d3.timeWeek(new Date(d.added_at))))
      .attr('cy', (d) => y(d.track.popularity))
      .attr('fill', (d, i) => col(i))
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
      .append('title')
      .text((d) => `${d.track.artists[0].name} - ${d.track.name}`);

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
      .text(`Average popularity: ${av.toFixed(2)}`);
  }, [tracks, maxWidth, maxHeight]);

  return (
    <div>
      <h1>Are my favourites popular?</h1>
      {tracks ? (
        <div>
          <svg ref={svgRef} width="100%" height={maxHeight + 50}></svg>
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
