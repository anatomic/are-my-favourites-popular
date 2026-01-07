/**
 * Chart Rendering Functions
 *
 * Pure functions for rendering different parts of the D3 chart.
 * Each function handles a specific visual element, making the code
 * easier to test, maintain, and modify independently.
 *
 * Modernizations:
 * - Uses D3 transitions for smooth animations
 * - Uses .join() pattern for cleaner data binding
 */

import { type Selection } from 'd3-selection';
import 'd3-transition'; // Extends Selection prototype with transition()
import { axisBottom, axisLeft } from 'd3-axis';
import { timeYear } from 'd3-time';
import type { ChartConfig } from '../../hooks/useChartConfig';
import type { SavedTrack, SpotifyTrack } from '../../types/spotify';
import { cssColors } from '../../utils/cssVariables';

// Animation duration in milliseconds
const TRANSITION_DURATION = 400;

type SVGSelection = Selection<SVGSVGElement, unknown, null, undefined>;

/**
 * Render the gradient definition used for coloring data points
 */
export function renderGradientDef(svg: SVGSelection): void {
  const defs = svg.append('defs');
  const gradient = defs.append('linearGradient')
    .attr('id', 'popularityGradient')
    .attr('x1', '0%')
    .attr('y1', '100%')
    .attr('x2', '0%')
    .attr('y2', '0%');

  gradient.append('stop')
    .attr('offset', '0%')
    .attr('stop-color', cssColors.chartGradientLow);
  gradient.append('stop')
    .attr('offset', '100%')
    .attr('stop-color', cssColors.chartGradientHigh);
}

/**
 * Render horizontal grid lines
 * Uses .join() pattern for cleaner data binding
 */
export function renderGridLines(svg: SVGSelection, config: ChartConfig): void {
  const { dimensions, scales, maxPopularity } = config;
  const { margins, width } = dimensions;
  const { y } = scales;

  const gridLines = [20, 40, 60, 80, 100].filter(
    v => v <= Math.ceil(maxPopularity / 10) * 10
  );

  svg.selectAll<SVGLineElement, number>('.grid-line')
    .data(gridLines)
    .join(
      enter => enter
        .append('line')
        .attr('class', 'grid-line')
        .attr('x1', margins.left)
        .attr('x2', width - margins.right)
        .attr('y1', (d: number) => y(d))
        .attr('y2', (d: number) => y(d))
        .attr('stroke', cssColors.chartGrid)
        .attr('stroke-width', 1)
        .attr('opacity', 0)
        .call(sel => (sel as any).transition()
          .duration(TRANSITION_DURATION)
          .attr('opacity', 1)
        ),
      update => update,
      exit => exit.call(sel => (sel as any).transition()
        .duration(TRANSITION_DURATION / 2)
        .attr('opacity', 0)
        .remove()
      )
    );
}

/**
 * Render X and Y axes
 */
export function renderAxes(svg: SVGSelection, config: ChartConfig): void {
  const { dimensions, scales } = config;
  const { height, margins } = dimensions;
  const { x, y } = scales;

  const xAxis = axisBottom(x).ticks(timeYear.every(1));
  const yAxis = axisLeft(y).ticks(5);

  // X-axis
  svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height - margins.bottom})`)
    .call(xAxis);

  // Y-axis
  svg.append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${margins.left},0)`)
    .call(yAxis);

  // Y-axis label
  svg.append('text')
    .attr('class', 'axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(height / 2))
    .attr('y', 16)
    .attr('text-anchor', 'middle')
    .text('Popularity Score');
}

export interface DataPointHandlers {
  onClick: (track: SpotifyTrack) => void;
  onMouseOver: (event: MouseEvent, track: SavedTrack, popColor: string) => void;
  onMouseOut: (event: MouseEvent, track: SavedTrack) => void;
}

/**
 * Render data point circles
 * Uses .join() pattern with staggered enter transitions for visual appeal
 */
export function renderDataPoints(
  svg: SVGSelection,
  config: ChartConfig,
  handlers: DataPointHandlers
): void {
  const { scales, sortedTracks, maxPopularity } = config;
  const { x, y, radius, color } = scales;

  // Calculate final attributes for each track
  const getRadius = (d: SavedTrack) =>
    d.track.popularity === maxPopularity
      ? radius(d.track.popularity) * 1.2
      : radius(d.track.popularity);

  const getFill = (d: SavedTrack) =>
    d.track.popularity === maxPopularity
      ? cssColors.spotifyGreen
      : color(d.track.popularity);

  const getOpacity = (d: SavedTrack) =>
    d.track.popularity === maxPopularity ? 1 : 0.75;

  const getStroke = (d: SavedTrack) =>
    d.track.popularity === maxPopularity
      ? cssColors.spotifyGreenLight
      : 'rgba(0,0,0,0.2)';

  const getStrokeWidth = (d: SavedTrack) =>
    d.track.popularity === maxPopularity ? 2 : 0.5;

  svg.selectAll<SVGCircleElement, SavedTrack>('circle.data-point')
    .data(sortedTracks, (d: SavedTrack) => d.track.id)
    .join(
      enter => enter
        .append('circle')
        .attr('class', 'data-point')
        .attr('cx', (d: SavedTrack) => x(new Date(d.added_at)))
        .attr('cy', (d: SavedTrack) => y(d.track.popularity))
        .attr('r', 0) // Start at 0 for grow animation
        .attr('fill', getFill)
        .attr('opacity', 0)
        .attr('stroke', getStroke)
        .attr('stroke-width', getStrokeWidth)
        .style('cursor', 'pointer')
        .on('click', function (_event: MouseEvent, d: SavedTrack) {
          handlers.onClick(d.track);
        })
        .on('mouseover', function (event: MouseEvent, d: SavedTrack) {
          const popColor = color(d.track.popularity);
          handlers.onMouseOver(event, d, popColor);
        })
        .on('mouseout', function (event: MouseEvent, d: SavedTrack) {
          handlers.onMouseOut(event, d);
        })
        .call(sel => (sel as any).transition()
          .duration(TRANSITION_DURATION)
          .delay((_d: SavedTrack, i: number) => Math.min(i * 2, 500)) // Staggered entry, capped at 500ms
          .attr('r', getRadius)
          .attr('opacity', getOpacity)
        ),
      update => update
        .call(sel => (sel as any).transition()
          .duration(TRANSITION_DURATION)
          .attr('cx', (d: SavedTrack) => x(new Date(d.added_at)))
          .attr('cy', (d: SavedTrack) => y(d.track.popularity))
          .attr('r', getRadius)
          .attr('fill', getFill)
          .attr('opacity', getOpacity)
        ),
      exit => exit
        .call(sel => (sel as any).transition()
          .duration(TRANSITION_DURATION / 2)
          .attr('r', 0)
          .attr('opacity', 0)
          .remove()
        )
    );
}

/**
 * Render the legend
 */
export function renderLegend(svg: SVGSelection, config: ChartConfig): void {
  const { dimensions } = config;
  const { width, margins } = dimensions;

  const legendX = width - margins.right - 170;
  const legendY = margins.top;

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
}

/**
 * Create tooltip HTML content
 */
export function createTooltipContent(track: SavedTrack, popColor: string): string {
  const addedDate = new Date(track.added_at).toLocaleDateString();

  return `
    <strong>${track.track.name}</strong>
    <span class="tooltip-artist">${track.track.artists.map(a => a.name).join(', ')}</span>
    <span class="tooltip-album">${track.track.album.name}</span>
    <span class="tooltip-stat">
      <span class="tooltip-label">Popularity</span>
      <span class="tooltip-value" style="color: ${popColor}">${track.track.popularity}</span>
    </span>
    <span class="tooltip-stat">
      <span class="tooltip-label">Added</span>
      <span class="tooltip-value">${addedDate}</span>
    </span>
  `;
}
