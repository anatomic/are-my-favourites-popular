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
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { select, type Selection } from 'd3-selection';
import type { ScaleTime } from 'd3-scale';
import type { ChartConfig, ChartDimensions } from './useChartConfig';

export interface ZoomState {
  /** Current d3 zoom transform */
  transform: ZoomTransform;
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

  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [zoomBehavior, setZoomBehavior] = useState<ZoomBehavior<SVGSVGElement, unknown> | null>(
    null
  );

  // Track if this is the first render to avoid resetting zoom on resize
  const isFirstRender = useRef(true);
  // Track previous track count to reset zoom when data changes
  const prevTrackCount = useRef<number | null>(null);

  // Create the zoomed X scale by applying transform to base scale
  const zoomedXScale = chartConfig
    ? (transform.rescaleX(chartConfig.scales.x) as ScaleTime<number, number>)
    : null;

  const isZoomed = transform.k !== 1 || transform.x !== 0;

  // Reset zoom to identity transform
  const resetZoom = useCallback(() => {
    if (!svgRef.current || !zoomBehavior) return;

    const svg = select(svgRef.current);
    svg.transition().duration(300).call(zoomBehavior.transform, zoomIdentity);
  }, [svgRef, zoomBehavior]);

  // Set up zoom behavior
  useEffect(() => {
    if (!svgRef.current || !chartConfig) return;

    const { dimensions, sortedTracks } = chartConfig;
    const { width, height, margins } = dimensions;
    const trackCount = sortedTracks.length;

    // Check if data changed (track count changed) - reset zoom in that case
    const dataChanged = prevTrackCount.current !== null && prevTrackCount.current !== trackCount;
    prevTrackCount.current = trackCount;

    // Calculate translate extent to prevent panning beyond data
    const translateExtent: [[number, number], [number, number]] = [
      [margins.left, margins.top],
      [width - margins.right, height - margins.bottom],
    ];

    // Create zoom behavior
    const zoomBehaviorInstance = zoom<SVGSVGElement, unknown>()
      .scaleExtent([minZoom, maxZoom])
      .translateExtent(translateExtent)
      .extent([
        [margins.left, margins.top],
        [width - margins.right, height - margins.bottom],
      ])
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
        setTransform(event.transform);
      });

    setZoomBehavior(zoomBehaviorInstance);

    // Apply zoom behavior to SVG
    const svg = select(svgRef.current);
    svg.call(zoomBehaviorInstance);

    // Create an invisible overlay rect for capturing zoom events
    // This ensures zoom works even in empty areas of the chart
    createZoomOverlay(svg, dimensions, margins);

    // Only reset transform on first render or when data changes
    // Preserve zoom state across window resizes
    if (isFirstRender.current || dataChanged) {
      setTransform(zoomIdentity);
      isFirstRender.current = false;
    }

    return () => {
      // Clean up zoom behavior
      svg.on('.zoom', null);
      svg.select('.zoom-overlay').remove();
    };
  }, [svgRef, chartConfig, minZoom, maxZoom]);

  return {
    transform,
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
