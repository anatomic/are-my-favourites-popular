/**
 * ZoomControls - Reset button for chart zoom
 *
 * Displays a reset button when the chart is zoomed.
 * Follows Spotify design guidelines (pill-shaped button).
 */

import type { ReactElement } from 'react';

interface ZoomControlsProps {
  /** Whether the chart is currently zoomed */
  isZoomed: boolean;
  /** Callback to reset zoom to initial state */
  onReset: () => void;
}

export function ZoomControls({ isZoomed, onReset }: ZoomControlsProps): ReactElement | null {
  if (!isZoomed) return null;

  return (
    <div className="zoom-controls">
      <button
        className="zoom-reset-btn"
        onClick={onReset}
        type="button"
        aria-label="Reset zoom to show all data"
      >
        Reset View
      </button>
    </div>
  );
}
