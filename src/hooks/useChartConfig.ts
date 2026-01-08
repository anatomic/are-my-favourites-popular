/**
 * useChartConfig - Chart configuration and scale calculations
 *
 * Extracts chart dimensions, margins, and D3 scales from the Dashboard component.
 * This hook handles all the derived state calculations for the chart.
 *
 * Modernizations:
 * - Uses ResizeObserver for responsive chart sizing
 */

import { useMemo, useState, useLayoutEffect, type RefObject } from 'react';
import { min, max } from 'd3-array';
import {
  scalePow,
  scaleTime,
  scaleLinear,
  type ScalePower,
  type ScaleTime,
  type ScaleLinear,
} from 'd3-scale';
import { interpolateRgb } from 'd3-interpolate';
import type { SavedTrack } from '../types/spotify';
import { cssColors } from '../utils/cssVariables';

export interface ChartMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartDimensions {
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  margins: ChartMargins;
}

export interface ChartScales {
  x: ScaleTime<number, number>;
  y: ScaleLinear<number, number>;
  radius: ScalePower<number, number>;
  color: (popularity: number) => string;
}

export interface ChartConfig {
  dimensions: ChartDimensions;
  scales: ChartScales;
  sortedTracks: SavedTrack[];
  maxPopularity: number;
}

const DEFAULT_MARGINS: ChartMargins = {
  top: 40,
  right: 30,
  bottom: 50,
  left: 60,
};

// Mobile margins - balanced padding, no axis label shown
const MOBILE_MARGINS: ChartMargins = {
  top: 20,
  right: 20,
  bottom: 40,
  left: 30,
};

// Container measurement constants
const CHART_ASPECT_RATIO = 0.42; // Height as ratio of width
const MIN_CHART_HEIGHT = 300;
const MAX_CHART_HEIGHT = 525;
const MAX_MEASUREMENT_RETRIES = 10; // Prevent infinite retry loop

// Time scale constants
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds
const X_AXIS_FUTURE_MONTHS = 6; // How many months to extend X axis into the future

/**
 * Hook to track container size using ResizeObserver
 * Returns responsive dimensions for the chart, or null until measured
 */
export function useContainerSize(
  containerRef: RefObject<HTMLElement | null>
): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number;
    let retryCount = 0;

    // Measurement function - retries on next frame if container not yet laid out
    const measure = (): void => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) {
        const height = Math.min(
          Math.max(rect.width * CHART_ASPECT_RATIO, MIN_CHART_HEIGHT),
          MAX_CHART_HEIGHT
        );
        setSize({ width: rect.width, height });
      } else if (retryCount < MAX_MEASUREMENT_RETRIES) {
        // Container not yet sized (flexbox/grid timing), retry next frame
        retryCount++;
        rafId = requestAnimationFrame(measure);
      } else {
        // Fallback: use default dimensions after max retries
        console.warn(
          'Chart container measurement failed after max retries, using fallback dimensions'
        );
        setSize({ width: 800, height: 400 });
      }
    };

    // Measure immediately on mount
    measure();

    // Set up observer for future resizes
    const observer = new ResizeObserver((entries) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const entry = entries[0];
        if (entry) {
          const { width } = entry.contentRect;
          if (width > 0) {
            const height = Math.min(
              Math.max(width * CHART_ASPECT_RATIO, MIN_CHART_HEIGHT),
              MAX_CHART_HEIGHT
            );
            setSize({ width, height });
          }
        }
      });
    });

    observer.observe(container);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [containerRef]);

  // Return null until we have real measurements - prevents rendering with wrong scale
  return size;
}

// Mobile breakpoint for reduced margins
const MOBILE_BREAKPOINT = 600;

/**
 * Calculate chart dimensions from container size
 * Uses reduced margins on mobile for more chart space
 */
function calculateDimensions(containerWidth: number, containerHeight: number): ChartDimensions {
  // Use actual container width - no cap, let CSS handle max-width if needed
  const width = containerWidth;
  const height = containerHeight;

  // Use mobile margins on small screens
  const margins = containerWidth <= MOBILE_BREAKPOINT ? MOBILE_MARGINS : DEFAULT_MARGINS;

  return {
    width,
    height,
    innerWidth: width - margins.left - margins.right,
    innerHeight: height - margins.top - margins.bottom,
    margins,
  };
}

/**
 * Create color interpolation function for popularity gradient
 */
function createColorScale(): (popularity: number) => string {
  return (popularity: number): string => {
    const t = popularity / 100;
    return interpolateRgb(cssColors.chartGradientLow, cssColors.chartGradientHigh)(t);
  };
}

/**
 * Calculate responsive radius range based on viewport width
 */
function getRadiusRange(width: number): [number, number] {
  if (width < 500) return [2, 8];
  if (width < 800) return [2, 12];
  if (width < 1200) return [3, 15];
  return [3, 18];
}

/**
 * Hook for chart configuration and scales
 *
 * @param tracks - Array of saved tracks to visualize
 * @param containerSize - Container dimensions from useContainerSize (null until measured)
 * @returns Chart configuration including dimensions and scales, or null if not ready
 */
export function useChartConfig(
  tracks: SavedTrack[] | null,
  containerSize: { width: number; height: number } | null
): ChartConfig | null {
  return useMemo(() => {
    // Don't create config until we have both tracks and real container measurements
    if (!tracks || tracks.length === 0 || !containerSize) return null;

    // Sort tracks chronologically
    const sortedTracks = [...tracks].sort(
      (a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
    );

    // Calculate dimensions from container size
    const dimensions = calculateDimensions(containerSize.width, containerSize.height);
    const { width, height, margins } = dimensions;

    // Calculate data extents
    const firstDate = min(sortedTracks, (d: SavedTrack) => new Date(d.added_at));
    const today = new Date();
    const maxPopularity = max(sortedTracks, (d: SavedTrack) => d.track.popularity) ?? 0;

    // Create scales - start 1 week before first track, end 6 months after today
    const xEnd = new Date(
      today.getFullYear(),
      today.getMonth() + X_AXIS_FUTURE_MONTHS,
      today.getDate()
    );
    const x = scaleTime()
      .domain([new Date((firstDate ?? today).getTime() - ONE_WEEK_MS), xEnd])
      .range([margins.left, width - margins.right]);

    const y = scaleLinear()
      .domain([0, Math.ceil(maxPopularity / 10) * 10])
      .range([height - margins.bottom, margins.top]);

    // Responsive radius scaling based on viewport width
    const radiusRange = getRadiusRange(containerSize.width);
    const radius = scalePow().exponent(1.5).domain([0, 100]).range(radiusRange);

    const color = createColorScale();

    return {
      dimensions,
      scales: { x, y, radius, color },
      sortedTracks,
      maxPopularity,
    };
  }, [tracks, containerSize]);
}

export { DEFAULT_MARGINS };
