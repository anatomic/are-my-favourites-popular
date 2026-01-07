# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A React/Vite application that visualizes the popularity of a user's Spotify saved tracks over time using D3.js charts. Users authenticate via Spotify OAuth (PKCE flow), and the app displays an interactive scatter plot showing track popularity trends.

## Commands

```bash
npm run dev      # Start dev server on port 3000
npm run build    # Build to dist/
npm run preview  # Preview production build
npm test         # Run tests in watch mode
npm run test:run # Run tests once
```

## Validating Changes

**IMPORTANT**: Always validate changes before pushing code. Run both the test suite and build to catch errors early.

### Required Validation Steps

1. **Run tests** to ensure functionality is preserved:
   ```bash
   npm test -- --run
   ```

2. **Run the build** to catch TypeScript errors:
   ```bash
   npm run build
   ```

The build runs `tsc` (TypeScript compiler) before Vite bundling. TSC errors are critical to catch before pushing - common issues include:
- Missing type properties in mock objects
- Unused variables (TypeScript strict mode)
- Invalid global assignments (use `vi.stubGlobal()` in tests instead of `global.X`)
- Missing imports

### Test Coverage

Run coverage report to check test quality:
```bash
npm run test:coverage
```

Current coverage targets core business logic modules:
- `src/auth.ts` - PKCE authentication
- `src/services/tokenService.ts` - Token management
- `src/services/spotifyApi.ts` - API calls with retry logic
- `src/cache/CacheService.ts` - Multi-adapter caching
- `src/hooks/useChartConfig.ts` - Chart configuration

## Architecture

**Auth Flow**: Spotify OAuth using Authorization Code with PKCE (no backend required)

- `src/auth.js` - PKCE utilities (code verifier/challenge generation, token exchange/refresh)
- `src/components/Login.jsx` - Initiates OAuth redirect to Spotify
- `src/App.jsx` - Handles OAuth callback, token storage (localStorage), and API requests

**Visualization**: D3.js chart rendered in React

- `src/components/Dashboard.jsx` - Main visualization component using D3 for:
  - Scatter plot of tracks (bubble size = popularity)
  - Moving average line (cumulative mean popularity)
  - Weekly mean line
  - Overall average line
  - Click-to-preview audio playback

**Data Flow**:

1. App fetches all saved tracks via paginated Spotify API calls (`/v1/me/tracks`)
2. Tracks grouped by week using `d3-time.timeWeek`
3. D3 renders SVG with scales for time (x), popularity (y), and bubble radius

## Spotify API Configuration

The `CLIENT_ID` is injected via Vite's `define` config (see `vite.config.js`). Override with environment variable:

```bash
CLIENT_ID=your_client_id npm run dev
```

Required Spotify scopes: `user-read-private`, `user-library-read`, `playlist-read-private`

## Design System

This app follows [Spotify's Design Guidelines](https://developer.spotify.com/documentation/design) and uses their approved brand elements.

### Color Palette

```css
/* Primary - Spotify Brand */
--spotify-green: #1db954; /* Primary accent, CTAs, success states */
--spotify-green-light: #1ed760; /* Logo tint, hover states */
--spotify-black: #191414; /* Primary background */
--spotify-dark: #121212; /* Cards, elevated surfaces */
--spotify-dark-highlight: #282828; /* Hover states on dark */

/* Text */
--text-primary: #ffffff; /* Headings, primary content */
--text-secondary: #b3b3b3; /* Secondary info, metadata */
--text-muted: #727272; /* Tertiary, timestamps */

/* Surfaces */
--surface-base: #121212; /* App background */
--surface-elevated: #181818; /* Cards */
--surface-highlight: #282828; /* Hover, focus states */

/* Data Visualization */
--chart-accent: #1db954; /* Primary data points */
--chart-secondary: #535353; /* Grid lines, axes */
--chart-area: rgba(29, 185, 84, 0.1); /* Area fills */
```

### Typography

Use platform defaults with this fallback stack:

```css
font-family:
  -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial,
  sans-serif;
```

**Scale:**

- Display: 32px / 700 weight — Page titles
- Heading: 24px / 700 weight — Section headers
- Title: 16px / 700 weight — Card titles, list items
- Body: 14px / 400 weight — Primary content
- Caption: 12px / 400 weight — Metadata, timestamps

### Components

**Buttons**

```css
/* Primary CTA */
.btn-primary {
  background: #1db954;
  color: #000000;
  border-radius: 500px; /* Spotify's pill shape */
  padding: 12px 32px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.btn-primary:hover {
  background: #1ed760;
  transform: scale(1.04);
}

/* Secondary/Ghost */
.btn-secondary {
  background: transparent;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 500px;
}
.btn-secondary:hover {
  border-color: #ffffff;
}
```

**Cards**

```css
.card {
  background: #181818;
  border-radius: 8px; /* 4px on mobile */
  padding: 16px;
  transition: background 0.3s ease;
}
.card:hover {
  background: #282828;
}
```

**Spotify Links** (tracks, artists, albums)

```css
.spotify-link {
  color: #ffffff;
  text-decoration: none;
}
.spotify-link:hover {
  color: #1db954;
  text-decoration: underline;
}
```

### Branding Assets We Can Use

Per Spotify guidelines, we are permitted to use:

- **Spotify Icon**: For "Listen on Spotify" buttons (min 21px)
- **Full Logo**: When space allows (min 70px)
- **Like Icon**: Heart icon for saved tracks
- Download from: [Spotify Design Resources](https://developer.spotify.com/documentation/design)

**Button Text Options:**

- "PLAY ON SPOTIFY" — When app is installed
- "LISTEN ON SPOTIFY" — Alternative
- "GET SPOTIFY FREE" — When app not installed

### Data Visualization Guidelines

**Chart Styling:**

- Dark background (`#121212`) for contrast
- Spotify Green (`#1DB954`) for primary data series
- White (`#FFFFFF`) for axis labels
- Muted gray (`#535353`) for grid lines
- Semi-transparent green fills for areas

**Data Points:**

- Use Spotify Green for interactive elements
- Size encoding: 4px min, 20px max radius
- Hover: brighten to `#1ED760`, show tooltip

**Tooltips:**

```css
.tooltip {
  background: #282828;
  color: #ffffff;
  border-radius: 4px;
  padding: 8px 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}
```

### Layout

- Max content width: 1400px
- Card grid gap: 24px (16px mobile)
- Section spacing: 48px (32px mobile)
- Border radius: 8px (4px on small components)

### Accessibility

- Minimum contrast ratio: 4.5:1 for text
- Focus states: 2px solid `#1DB954` outline
- All interactive elements keyboard accessible
- Metadata truncation must show full text on hover/focus

### Attribution Requirements

- All Spotify metadata links back to Spotify
- Track links: `https://open.spotify.com/track/{id}`
- Artist links: `https://open.spotify.com/artist/{id}`
- Album links: `https://open.spotify.com/album/{id}`
- Always use `target="_blank" rel="noopener noreferrer"`
- Max 20 items per content list

### Audio Playback

- Preview only (15-30 sec clips via `preview_url`)
- Play/pause controls only — no seek/skip
- Visual feedback during playback (pulse animation on data point)
