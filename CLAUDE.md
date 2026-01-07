# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A React/Vite application that visualizes the popularity of a user's Spotify saved tracks over time using D3.js charts. Users authenticate via Spotify OAuth (PKCE flow), and the app displays an interactive scatter plot showing track popularity trends.

## Commands

```bash
npm run dev      # Start dev server on port 3000
npm run build    # Build to dist/
npm run preview  # Preview production build
```

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

## Spotify Design Guidelines Compliance

This app follows [Spotify's Design Guidelines](https://developer.spotify.com/documentation/design).

### Requirements We Follow

**Linking to Spotify**
- All track names link to `https://open.spotify.com/track/{id}`
- All artist names link to `https://open.spotify.com/artist/{id}`
- Links open in new tab with `rel="noopener noreferrer"`

**Metadata Display**
- Track/artist names displayed exactly as provided by Spotify API
- Names truncated with ellipsis when space-constrained (full name accessible on hover)
- Maximum 20 items per content list (Spotify's limit)

**Content Attribution**
- App displays user's own saved library data
- No Spotify logo required for personal data visualization (not a partner integration)

**Playback**
- Audio previews (15-30 sec) via track's `preview_url`
- Play on mousedown, pause on mouseup (no seek/skip controls)

### Color Usage
- Spotify Green (`#1DB954`) used for hover states on Spotify links
- Maintains high contrast for accessibility

### What We Don't Do
- No Spotify logo usage (would require approval)
- No playlist/album artwork display
- No streaming playback (only previews)
- App name doesn't include "Spotify"
