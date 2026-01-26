/**
 * useChartZoom - Chart zoom and pan behavior
 *
 * Implements semantic zoom for the chart using d3-zoom.
 * Rescales the X axis while keeping Y axis fixed.
 *
 * Interactions:
 * - Mouse wheel to zoom in/out (centered on cursor)
 * - Click-drag to pan
 * - Pinch-to-zoom on touch devices
 * - Reset button to return to full view
 *
 * Constraints:
 * - Panning is constrained to keep data visible (can't pan to dates outside data range)
 * - Trackpad-optimized with reduced sensitivity for smoother control
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  zoom as d3Zoom,
  zoomIdentity,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3-zoom';
import { select, type Selection } from 'd3-selection';
import type { ScaleTime } from 'd3-scale';
import type { ChartConfig, ChartDimensions } from './useChartConfig';

export interface ZoomState {
  /** Whether currently zoomed (transform !== identity) */
  isZoomed: boolean;
  /** X scale with zoom transform applied */
  zoomedXScale: ScaleTime<number, number> | null;
  /** Reset zoom to initial state */
  resetZoom: () => void;
}

interface UseChartZoomOptions {
  /** Minimum zoom level (1 = full data range) */
  minZoom?: number;
  /** Maximum zoom level */
  maxZoom?: number;
}

// Simple transform state that doesn't use d3 objects directly in React state
interface TransformState {
  k: number;
  x: number;
  y: number;
}

const IDENTITY_TRANSFORM: TransformState = { k: 1, x: 0, y: 0 };

// Wheel delta multiplier for smoother trackpad zoom (lower = more control)
const WHEEL_DELTA_FACTOR = 0.002;

/**
 * Hook for chart zoom and pan behavior
 *
 * @param svgRef - Ref to the SVG element
 * @param chartConfig - Chart configuration with scales and dimensions
 * @param options - Zoom configuration options
 * @returns Zoom state including zoomed scale and reset function
 */
export function useChartZoom(
  svgRef: RefObject<SVGSVGElement | null>,
  chartConfig: ChartConfig | null,
  options: UseChartZoomOptions = {}
): ZoomState {
  const { minZoom = 1, maxZoom = 10 } = options;

  // Store transform as simple object, not d3 ZoomTransform
  const [transformState, setTransformState] = useState<TransformState>(IDENTITY_TRANSFORM);

  // Store zoom behavior in ref (doesn't need to trigger re-renders)
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Track if this is the first render to avoid resetting zoom on resize
  const isFirstRender = useRef(true);
  // Track previous track count to reset zoom when data changes
  const prevTrackCount = useRef<number | null>(null);

  // Create the zoomed X scale by applying transform to base scale
  const zoomedXScale = chartConfig
    ? chartConfig.scales.x
        .copy()
        .domain(
          chartConfig.scales.x.domain().map((d) => {
            // Apply inverse transform to get the new domain
            return new Date((d.getTime() - transformState.x) / transformState.k);
          })
        )
    : null;

  const isZoomed = transformState.k !== 1 || transformState.x !== 0;

  // Reset zoom to identity transform
  const resetZoom = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;

    const svg = select(svgRef.current);
    svg.transition().duration(300).call(zoomBehaviorRef.current.transform, zoomIdentity);
  }, [svgRef]);

  // Set up zoom behavior
  useEffect(() => {
    if (!svgRef.current || !chartConfig) return;

    const { dimensions, sortedTracks } = chartConfig;
    const { width, height, margins } = dimensions;
    const trackCount = sortedTracks.length;

    // Check if data changed (track count changed) - reset zoom in that case
    const dataChanged = prevTrackCount.current !== null && prevTrackCount.current !== trackCount;
    prevTrackCount.current = trackCount;

    // Chart area bounds in pixel coordinates
    const chartLeft = margins.left;
    const chartRight = width - margins.right;
    const chartWidth = chartRight - chartLeft;

    // Constrain function to keep data visible at all zoom levels
    // This prevents panning beyond the data bounds
    const constrainTransform = (
      transform: ZoomTransform,
      _extent: [[number, number], [number, number]]
    ): ZoomTransform => {
      // Calculate the visible width at current zoom level
      const visibleWidth = chartWidth / transform.k;

      // Calculate min/max translation to keep data in view
      // At k=1, x should be 0 (full view)
      // At k>1, x can range from 0 to -(chartWidth - visibleWidth) * k
      const maxX = 0;
      const minX = -(chartWidth - visibleWidth) * transform.k;

      // Constrain x translation
      const constrainedX = Math.max(minX, Math.min(maxX, transform.x));

      // Return new transform if constrained, otherwise return original
      if (constrainedX !== transform.x) {
        return zoomIdentity.translate(constrainedX, transform.y).scale(transform.k);
      }
      return transform;
    };

    // Create zoom behavior
    const zoomBehaviorInstance = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([minZoom, maxZoom])
      .extent([
        [chartLeft, margins.top],
        [chartRight, height - margins.bottom],
      ])
      // Use constrain instead of translateExtent for more precise control
      .constrain(constrainTransform)
      // Reduce wheel delta for smoother trackpad zooming
      .wheelDelta((event: WheelEvent) => {
        // Default d3 behavior uses -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002)
        // We use a smaller factor for smoother trackpad control
        const delta = -event.deltaY * (event.deltaMode === 1 ? 0.05 : WHEEL_DELTA_FACTOR);
        // Clamp the delta to prevent huge jumps
        return Math.max(-0.5, Math.min(0.5, delta));
      })
      .filter((event: Event) => {
        // Allow wheel events (for zooming)
        if (event.type === 'wheel') return true;

        // Allow touch events (for pinch-to-zoom)
        if (event.type.startsWith('touch')) return true;

        // For mouse events, only allow left button drag
        if (event.type === 'mousedown') {
          return (event as MouseEvent).button === 0;
        }

        return true;
      })
      .on('zoom', (event) => {
        // Extract simple values from d3 transform to store in state
        const { k, x, y } = event.transform;
        setTransformState({ k, x, y });
      });

    zoomBehaviorRef.current = zoomBehaviorInstance;

    // Apply zoom behavior to SVG
    const svg = select(svgRef.current);
    svg.call(zoomBehaviorInstance);

    // Create an invisible overlay rect for capturing zoom events
    // This ensures zoom works even in empty areas of the chart
    createZoomOverlay(svg, dimensions, margins);

    // Only reset transform on first render or when data changes
    // Preserve zoom state across window resizes
    if (isFirstRender.current || dataChanged) {
      setTransformState(IDENTITY_TRANSFORM);
      isFirstRender.current = false;
    }

    return () => {
      // Clean up zoom behavior
      svg.on('.zoom', null);
      svg.select('.zoom-overlay').remove();
    };
  }, [svgRef, chartConfig, minZoom, maxZoom]);

  return {
    isZoomed,
    zoomedXScale,
    resetZoom,
  };
}

/**
 * Create an invisible overlay rectangle for capturing zoom events
 */
function createZoomOverlay(
  svg: Selection<SVGSVGElement, unknown, null, undefined>,
  dimensions: ChartDimensions,
  margins: ChartDimensions['margins']
): void {
  // Remove existing overlay if present
  svg.select('.zoom-overlay').remove();

  // Create overlay rect that covers the chart area
  svg
    .append('rect')
    .attr('class', 'zoom-overlay')
    .attr('x', margins.left)
    .attr('y', margins.top)
    .attr('width', dimensions.width - margins.left - margins.right)
    .attr('height', dimensions.height - margins.top - margins.bottom)
    .attr('fill', 'none')
    .attr('pointer-events', 'all')
    .style('cursor', 'grab')
    .lower(); // Move behind data points
}

export { zoomIdentity };
