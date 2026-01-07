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

import { type Selection, select } from "d3-selection";
import { transition } from "d3-transition";
import { axisBottom, axisLeft } from "d3-axis";
import { timeYear } from "d3-time";
import type { ChartConfig } from "../../hooks/useChartConfig";
import type { SavedTrack, SpotifyTrack } from "../../types/spotify";
import { cssColors } from "../../utils/cssVariables";

// Ensure d3-transition extends d3-selection
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
transition;

// Animation timing configuration
const TRANSITION_DURATION = 600;
const MAX_STAGGER_DELAY = 1000; // Cap total stagger time for large datasets
const STAGGER_PER_ITEM = 2; // Milliseconds delay per item for deterministic staggering
const MIN_RADIUS = 2; // Starting radius for animation

type SVGSelection = Selection<SVGSVGElement, unknown, null, undefined>;

/**
 * Render the gradient definition used for coloring data points
 */
export function renderGradientDef(svg: SVGSelection): void {
  const defs = svg.append("defs");
  const gradient = defs
    .append("linearGradient")
    .attr("id", "popularityGradient")
    .attr("x1", "0%")
    .attr("y1", "100%")
    .attr("x2", "0%")
    .attr("y2", "0%");

  gradient
    .append("stop")
    .attr("offset", "0%")
    .attr("stop-color", cssColors.chartGradientLow);
  gradient
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", cssColors.chartGradientHigh);
}

/**
 * Render horizontal grid lines (no animation)
 */
export function renderGridLines(svg: SVGSelection, config: ChartConfig): void {
  const { dimensions, scales, maxPopularity } = config;
  const { margins, width } = dimensions;
  const { y } = scales;

  const gridLines = [20, 40, 60, 80, 100].filter(
    (v) => v <= Math.ceil(maxPopularity / 10) * 10,
  );

  svg
    .selectAll<SVGLineElement, number>(".grid-line")
    .data(gridLines)
    .enter()
    .append("line")
    .attr("class", "grid-line")
    .attr("x1", margins.left)
    .attr("x2", width - margins.right)
    .attr("y1", (d: number) => y(d))
    .attr("y2", (d: number) => y(d))
    .attr("stroke", cssColors.chartGrid)
    .attr("stroke-width", 1)
    .attr("opacity", 1);
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
  svg
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height - margins.bottom})`)
    .call(xAxis);

  // Y-axis
  svg
    .append("g")
    .attr("class", "y-axis")
    .attr("transform", `translate(${margins.left},0)`)
    .call(yAxis);

  // Y-axis label
  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -(height / 2))
    .attr("y", 16)
    .attr("text-anchor", "middle")
    .text("Popularity Score");
}

export interface DataPointHandlers {
  onClick: (track: SpotifyTrack) => void;
  onMouseOver: (event: MouseEvent, track: SavedTrack, popColor: string) => void;
  onMouseOut: (event: MouseEvent, track: SavedTrack) => void;
}

/**
 * Set up event delegation on the data points container.
 * Uses event bubbling - handlers are attached to the container once,
 * not to each individual circle. This is more efficient and doesn't
 * require reattaching handlers when data changes.
 *
 * @param svg - The SVG selection
 * @param config - Chart configuration with scales
 * @param handlers - Event handler callbacks
 */
export function setupDataPointHandlers(
  svg: SVGSelection,
  config: ChartConfig,
  handlers: DataPointHandlers,
): void {
  const { scales } = config;
  const { color } = scales;

  // Get or create the data points container group
  let container = svg.select<SVGGElement>("g.data-points-container");
  if (container.empty()) {
    container = svg.append("g").attr("class", "data-points-container");
  }

  // Event delegation: attach handlers to container, use bubbling to catch circle events
  container
    .on("click", function (event: MouseEvent) {
      const target = event.target as Element;
      if (target.classList.contains("data-point")) {
        const d = select<Element, SavedTrack>(target).datum();
        if (d) handlers.onClick(d.track);
      }
    })
    .on("mouseover", function (event: MouseEvent) {
      const target = event.target as Element;
      if (target.classList.contains("data-point")) {
        const d = select<Element, SavedTrack>(target).datum();
        if (d) {
          const popColor = color(d.track.popularity);
          handlers.onMouseOver(event, d, popColor);
        }
      }
    })
    .on("mouseout", function (event: MouseEvent) {
      const target = event.target as Element;
      if (target.classList.contains("data-point")) {
        const d = select<Element, SavedTrack>(target).datum();
        if (d) handlers.onMouseOut(event, d);
      }
    });
}

/**
 * Render data point circles
 *
 * Animation: On first render, circles start at Y=0 (bottom) with minimum size
 * and animate up to their positions with staggered timing. On subsequent renders,
 * circles smoothly transition to new positions without stagger.
 *
 * First render is detected internally by checking if circles already exist.
 */
export function renderDataPoints(svg: SVGSelection, config: ChartConfig): void {
  const { dimensions, scales, sortedTracks, maxPopularity } = config;
  const { x, y, radius } = scales;

  // Starting Y position (bottom of chart area)
  const startY = dimensions.height - dimensions.margins.bottom;

  // Starting color (low end of gradient)
  const startColor = cssColors.chartGradientLow;

  // Calculate final attributes for each track
  const getRadius = (d: SavedTrack) =>
    d.track.popularity === maxPopularity
      ? radius(d.track.popularity) * 1.2
      : radius(d.track.popularity);

  const getFill = (d: SavedTrack) =>
    d.track.popularity === maxPopularity
      ? cssColors.spotifyGreen
      : scales.color(d.track.popularity);

  const getOpacity = (d: SavedTrack) =>
    d.track.popularity === maxPopularity ? 1 : 0.75;

  const getStroke = (d: SavedTrack) =>
    d.track.popularity === maxPopularity
      ? cssColors.spotifyGreenLight
      : "rgba(0,0,0,0.2)";

  const getStrokeWidth = (d: SavedTrack) =>
    d.track.popularity === maxPopularity ? 2 : 0.5;

  // Get or create the container group for data points
  let container = svg.select<SVGGElement>("g.data-points-container");
  if (container.empty()) {
    container = svg.append("g").attr("class", "data-points-container");
  }

  // Detect first render by checking if circles already exist
  const isFirstRender = container.selectAll("circle.data-point").empty();

  // Bind data with track ID as key for proper enter/update/exit detection
  const circles = container
    .selectAll<SVGCircleElement, SavedTrack>("circle.data-point")
    .data(sortedTracks, (d: SavedTrack) => d.track.id);

  // Handle exiting elements - animate down and out
  circles.exit().each(function (this: SVGCircleElement) {
    select(this)
      .transition()
      .duration(TRANSITION_DURATION / 2)
      .attr("cy", startY)
      .attr("r", MIN_RADIUS)
      .attr("opacity", 0)
      .remove();
  });

  // Handle entering elements - create circles
  const entering = circles
    .enter()
    .append("circle")
    .attr("class", "data-point")
    .attr("cx", (d: SavedTrack) => x(new Date(d.added_at)))
    .attr(
      "cy",
      isFirstRender ? startY : (d: SavedTrack) => y(d.track.popularity),
    )
    .attr("r", isFirstRender ? MIN_RADIUS : getRadius)
    .attr("fill", isFirstRender ? startColor : getFill)
    .attr("opacity", isFirstRender ? 0.6 : getOpacity)
    .attr("stroke", isFirstRender ? "rgba(0,0,0,0.1)" : getStroke)
    .attr("stroke-width", isFirstRender ? 0.5 : getStrokeWidth)
    .style("cursor", "pointer");

  // Animate entering elements (only stagger on first render)
  if (isFirstRender) {
    entering.each(function (this: SVGCircleElement, d: SavedTrack, i: number) {
      // Deterministic stagger based on index, capped at MAX_STAGGER_DELAY
      const delay = Math.min(i * STAGGER_PER_ITEM, MAX_STAGGER_DELAY);
      select(this)
        .transition()
        .duration(TRANSITION_DURATION)
        .delay(delay)
        .attr("cy", y(d.track.popularity))
        .attr("r", getRadius(d))
        .attr("fill", getFill(d))
        .attr("opacity", getOpacity(d))
        .attr("stroke", getStroke(d))
        .attr("stroke-width", getStrokeWidth(d));
    });
  }

  // Handle updating elements - animate position, radius, fill, opacity
  // cx must update on resize since scale range changes
  circles.each(function (this: SVGCircleElement, d: SavedTrack) {
    select(this)
      .transition()
      .duration(TRANSITION_DURATION)
      .attr("cx", x(new Date(d.added_at)))
      .attr("cy", y(d.track.popularity))
      .attr("r", getRadius(d))
      .attr("fill", getFill(d))
      .attr("opacity", getOpacity(d));
  });
}

/**
 * Escape HTML to prevent XSS vulnerabilities
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create tooltip HTML content
 */
export function createTooltipContent(
  track: SavedTrack,
  popColor: string,
): string {
  const addedDate = new Date(track.added_at).toLocaleDateString();

  // Escape all user-provided content to prevent XSS
  const trackName = escapeHtml(track.track.name);
  const artistNames = escapeHtml(track.track.artists.map((a) => a.name).join(", "));
  const albumName = escapeHtml(track.track.album.name);
  // Escape color value in case it's manipulated
  const safeColor = escapeHtml(popColor);

  return `
    <strong>${trackName}</strong>
    <span class="tooltip-artist">${artistNames}</span>
    <span class="tooltip-album">${albumName}</span>
    <span class="tooltip-stat">
      <span class="tooltip-label">Popularity</span>
      <span class="tooltip-value" style="color: ${safeColor}">${track.track.popularity}</span>
    </span>
    <span class="tooltip-stat">
      <span class="tooltip-label">Added</span>
      <span class="tooltip-value">${addedDate}</span>
    </span>
  `;
}
