/**
 * CSS Variables Utility
 *
 * Provides access to CSS custom properties from JavaScript.
 * Useful for D3 charts and other JS code that needs design tokens.
 *
 * Values are cached on first access to avoid repeated getComputedStyle calls,
 * which is important for performance when accessing colors in D3 callbacks
 * that run for each data point (potentially thousands of times).
 */

// Cache for CSS variable values
const cssVariableCache = new Map<string, string>();

/**
 * Get a CSS variable value from the document root.
 * Values are cached after first read to avoid repeated layout calculations.
 * Throws an error if the variable is not defined.
 */
export function getCssVariable(name: string): string {
  // Return cached value if available
  const cached = cssVariableCache.get(name);
  if (cached !== undefined) {
    return cached;
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (!value) {
    throw new Error(`CSS variable "${name}" is not defined on :root.`);
  }

  // Cache the value for future reads
  cssVariableCache.set(name, value);
  return value;
}

/**
 * Clear the CSS variable cache.
 * Call this if CSS variables change at runtime (e.g., theme switching).
 */
export function clearCssVariableCache(): void {
  cssVariableCache.clear();
}

/**
 * Pre-defined color getters for commonly used design tokens.
 * These match the variables defined in src/styles/variables.css.
 * Values are cached on first access for performance.
 */
export const cssColors = {
  // Brand colors
  get spotifyGreen() {
    return getCssVariable('--spotify-green');
  },
  get spotifyGreenLight() {
    return getCssVariable('--spotify-green-light');
  },

  // Surfaces
  get surfaceHighlight() {
    return getCssVariable('--surface-highlight');
  },

  // Text
  get textPrimary() {
    return getCssVariable('--text-primary');
  },
  get textSecondary() {
    return getCssVariable('--text-secondary');
  },
  get textMuted() {
    return getCssVariable('--text-muted');
  },

  // Chart colors
  get chartSecondary() {
    return getCssVariable('--chart-secondary');
  },
  get chartGradientLow() {
    return getCssVariable('--chart-gradient-low');
  },
  get chartGradientHigh() {
    return getCssVariable('--chart-gradient-high');
  },
  get chartGrid() {
    return getCssVariable('--chart-grid');
  },

  // Highlight colors
  get highlightBusiest() {
    return getCssVariable('--highlight-busiest');
  },
  get highlightPopular() {
    return getCssVariable('--highlight-popular');
  },
  get highlightNiche() {
    return getCssVariable('--highlight-niche');
  },
  get highlightGrowth() {
    return getCssVariable('--highlight-growth');
  },
} as const;
