/**
 * useChartConfig - Chart configuration and scale calculations
 *
 * Extracts chart dimensions, margins, and D3 scales from the Dashboard component.
 * This hook handles all the derived state calculations for the chart.
 *
 * Modernizations:
 * - Uses ResizeObserver for responsive chart sizing
 */

import { useMemo, useState, useEffect, type RefObject } from 'react';
import { min, max } from 'd3-array';
import { scalePow, scaleTime, scaleLinear, type ScalePower, type ScaleTime, type ScaleLinear } from 'd3-scale';
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

/**
 * Hook to track container size using ResizeObserver
 * Returns responsive dimensions for the chart
 */
export function useContainerSize(
  containerRef: RefObject<HTMLElement | null>
): { width: number; height: number } {
  const [size, setSize] = useState({ width: 800, height: 400 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Debounce resize updates for performance
    let rafId: number;
    const observer = new ResizeObserver((entries) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const entry = entries[0];
        if (entry) {
          const { width } = entry.contentRect;
          // Calculate height based on aspect ratio, capped
          const height = Math.min(Math.max(width * 0.4, 300), 500);
          setSize({ width, height });
        }
      });
    });

    observer.observe(container);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [containerRef]);

  return size;
}

/**
 * Calculate chart dimensions from container size
 */
function calculateDimensions(
  containerWidth: number,
  containerHeight: number,
  margins: ChartMargins = DEFAULT_MARGINS
): ChartDimensions {
  const width = Math.min(containerWidth, 1400);
  const height = containerHeight;

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
 * Hook for chart configuration and scales
 *
 * @param tracks - Array of saved tracks to visualize
 * @param containerSize - Container dimensions from useContainerSize
 * @returns Chart configuration including dimensions and scales
 */
export function useChartConfig(
  tracks: SavedTrack[] | null,
  containerSize: { width: number; height: number } = { width: 800, height: 400 }
): ChartConfig | null {
  return useMemo(() => {
    if (!tracks || tracks.length === 0) return null;

    // Sort tracks chronologically
    const sortedTracks = [...tracks].sort(
      (a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
    );

    // Calculate dimensions from container size
    const dimensions = calculateDimensions(containerSize.width, containerSize.height);
    const { width, height, margins } = dimensions;

    // Calculate data extents
    const firstDate = min(sortedTracks, (d: SavedTrack) => new Date(d.added_at));
    const lastDate = max(sortedTracks, (d: SavedTrack) => new Date(d.added_at));
    const today = new Date();
    const maxPopularity = max(sortedTracks, (d: SavedTrack) => d.track.popularity) ?? 0;

    // Create scales
    const x = scaleTime()
      .domain([
        firstDate ?? today,
        (lastDate ?? today) > today ? (lastDate ?? today) : today
      ])
      .range([margins.left, width - margins.right])
      .nice();

    const y = scaleLinear()
      .domain([0, Math.ceil(maxPopularity / 10) * 10])
      .range([height - margins.bottom, margins.top]);

    const radius = scalePow()
      .exponent(1.5)
      .domain([0, 100])
      .range([3, 18]);

    const color = createColorScale();

    return {
      dimensions,
      scales: { x, y, radius, color },
      sortedTracks,
      maxPopularity,
    };
  }, [tracks, containerSize.width, containerSize.height]);
}

export { DEFAULT_MARGINS };
