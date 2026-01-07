/**
 * CSS Variables Utility
 *
 * Provides access to CSS custom properties from JavaScript.
 * Useful for D3 charts and other JS code that needs design tokens.
 */

/**
 * Get a CSS variable value from the document root
 */
export function getCssVariable(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Pre-defined color getters for commonly used design tokens
 * These match the variables defined in src/styles/variables.css
 */
export const cssColors = {
  // Brand colors
  get spotifyGreen() { return getCssVariable('--spotify-green'); },
  get spotifyGreenLight() { return getCssVariable('--spotify-green-light'); },

  // Surfaces
  get surfaceHighlight() { return getCssVariable('--surface-highlight'); },

  // Text
  get textPrimary() { return getCssVariable('--text-primary'); },
  get textSecondary() { return getCssVariable('--text-secondary'); },
  get textMuted() { return getCssVariable('--text-muted'); },

  // Chart colors
  get chartSecondary() { return getCssVariable('--chart-secondary'); },
  get chartGradientLow() { return getCssVariable('--chart-gradient-low'); },
  get chartGradientHigh() { return getCssVariable('--chart-gradient-high'); },
  get chartGrid() { return getCssVariable('--chart-grid'); },

  // Highlight colors
  get highlightBusiest() { return getCssVariable('--highlight-busiest'); },
  get highlightPopular() { return getCssVariable('--highlight-popular'); },
  get highlightNiche() { return getCssVariable('--highlight-niche'); },
  get highlightGrowth() { return getCssVariable('--highlight-growth'); },
} as const;
