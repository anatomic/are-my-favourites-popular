/**
 * useChartConfig - Chart configuration and scale calculations
 *
 * Extracts chart dimensions, margins, and D3 scales from the Dashboard component.
 * This hook handles all the derived state calculations for the chart.
 */

import { useMemo } from 'react';
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
 * Calculate responsive chart dimensions based on window size
 */
function calculateDimensions(margins: ChartMargins = DEFAULT_MARGINS): ChartDimensions {
  const width = typeof window !== 'undefined'
    ? Math.min(window.innerWidth - 80, 1400)
    : 800;
  const height = typeof window !== 'undefined'
    ? Math.min(window.innerHeight - 280, 500)
    : 400;

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
 * @returns Chart configuration including dimensions and scales
 */
export function useChartConfig(tracks: SavedTrack[] | null): ChartConfig | null {
  return useMemo(() => {
    if (!tracks || tracks.length === 0) return null;

    // Sort tracks chronologically
    const sortedTracks = [...tracks].sort(
      (a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
    );

    // Calculate dimensions
    const dimensions = calculateDimensions();
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
  }, [tracks]);
}

export { DEFAULT_MARGINS };
