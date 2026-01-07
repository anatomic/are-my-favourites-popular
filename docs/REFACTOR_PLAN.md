# Harsh Code Review: Are My Favourites Popular?

**Verdict: This is a hobby project masquerading as production code.**

---

## Critical Issues

### 1. Zero Test Coverage (Unacceptable for v2.0.0)

No tests. None. A "2.0.0" release with absolutely no test files. No Jest, no Vitest, no Cypress, nothing. This is negligent for any project that handles authentication and user data.

```json
// package.json - conspicuously absent:
"scripts": {
  "test": "???"  // Doesn't exist
}
```

### 2. God Component Anti-Pattern (`src/App.jsx`)

App.jsx does *everything*:
- OAuth callback handling
- Token management
- Token refresh logic
- User ID fetching
- Track loading
- Artist loading
- Cache orchestration
- Error handling
- Logout

This is 337 lines of spaghetti. Extract these into proper hooks and services.

### 3. Security: Tokens in localStorage

```javascript
// App.jsx:102-106
localStorage.setItem('access_token', tokenData.access_token);
localStorage.setItem('expires_at', Date.now() + tokenData.expires_in * 1000);
localStorage.setItem('refresh_token', tokenData.refresh_token);
```

**localStorage is vulnerable to XSS attacks.** Any injected script can steal these tokens. Use httpOnly cookies or at minimum, sessionStorage for the access token.

### 4. Magic Global Variable

```javascript
// auth.js:36
client_id: CLIENT_ID,  // Where does this come from???
```

`CLIENT_ID` is a magic global injected by Vite's `define`. This is invisible, untraceable, and will confuse every new developer. Should be an explicit import or environment variable.

### 5. React StrictMode Workaround is a Code Smell

```javascript
// useSpotifyPlayer.js:7-8
let playerInstance = null;
let playerDeviceId = null;
```

Module-level mutable state to "prevent StrictMode from creating multiple players." This is fighting React's design. If your code breaks in StrictMode, your code has bugs.

---

## Architecture Problems

### 6. No State Management

Props drilled through 4+ levels:
- `App` → `Dashboard` → `Stats` → individual list items
- `getAccessToken` prop passed everywhere

Use React Context or a state manager. This prop drilling creates tight coupling.

### 7. D3 in React: The Hard Way

```javascript
// Dashboard.jsx:75-258 - 183 lines of useEffect
useEffect(() => {
  select(svgRef.current).selectAll('*').remove();  // Nuke and repave
  // ... 180 more lines of D3
}, [tracks, maxWidth, maxHeight, /* 7 more deps */]);
```

On every render when any dependency changes, you destroy the entire SVG and rebuild it from scratch. This is horribly inefficient and loses any D3 transitions. Consider react-d3-library, visx, or at minimum, break this into smaller effects.

### 8. Cache Architecture is Over-Engineered

Three storage adapters (IndexedDB, localStorage, Memory) with automatic fallback. For what? A 10-minute track cache and 24-hour artist cache. This complexity adds ~400 lines of code for marginal benefit.

Meanwhile, `getCachedArtists` does N sequential async reads:

```javascript
// SpotifyCache.js:111-119
for (const artistId of artistIds) {
  const cached = await this._cacheService.get(STORES.ARTISTS, artistId);
  // Sequential! One at a time!
}
```

**This should be a batch read.** If you have 500 artists, that's 500 sequential IDB transactions.

---

## Performance Issues

### 9. 1-Second Polling is Wasteful

```javascript
// useSpotifyPlayer.js:3
const POLL_INTERVAL = 1000; // Poll external playback state every second
```

Polling Spotify's API every second, forever, while the tab is open. This:
- Wastes user bandwidth
- Hammers Spotify's servers
- Drains mobile batteries

Use Spotify's Web Playback SDK state events, or at minimum, poll less frequently when the tab is inactive.

### 10. No Virtualization

Users can have thousands of saved tracks. All track lists render every item:

```javascript
// Stats.jsx:149-177
{top20Popular.map((item, i) => (
  <li key={i}>{/* Full DOM for each */}</li>
))}
```

With 2,500 tracks and multiple sorted views, you're creating thousands of DOM nodes. Use react-window or react-virtualized.

### 11. Sequential Artist Fetching

```javascript
// App.jsx:220-242
for (let i = 0; i < uncachedIds.length; i += 50) {
  const batch = uncachedIds.slice(i, i + 50);
  const response = await fetch(...);  // Sequential!
}
```

With 1,000 artists and batches of 50, that's 20 *sequential* API calls. Use `Promise.all` with a reasonable concurrency limit.

---

## Code Quality Issues

### 12. Magic Numbers Everywhere

```javascript
5 * 60 * 1000  // What is this? 5 minutes
60 * 1000      // What is this? 1 minute
50             // Spotify batch limit? Maybe?
500            // Arbitrary delay
300            // Another arbitrary delay
1000, 2000, 3000  // Retry delays, no explanation
```

Extract these to named constants. Future you will not remember what `5 * 60 * 1000` means.

### 13. Console Statements in Production

```javascript
console.log('SDK ready event - device_id:', sdkDeviceId);
console.log('Reusing existing player instance');
console.log('Successfully connected to Spotify');
console.warn('Device lookup attempt failed:', e.message);
console.error('Auth error:', err);
// ... 30+ more
```

Use a proper logger with log levels, or strip these in production builds.

### 14. Dead/Unused Code

- `playlists.css` - 26 lines, no corresponding component
- `chartWidth`, `chartHeight` in Dashboard's useMemo dependencies but one isn't used
- `toTitleCase` function - genres from Spotify are already formatted

### 15. Inconsistent Error Handling

Some functions catch and handle errors:
```javascript
} catch (err) {
  console.error('Auth error:', err);
  setError(err.message);
```

Others silently swallow them:
```javascript
} catch (e) {
  return false;
}
```

Others don't catch at all (loadCollection pagination).

### 16. TypeScript Absence

Complex data structures (`tracks`, `artistMap`, player state), API responses, and callback props - all untyped. In 2024/2025, there's no excuse for not using TypeScript in a project of this size.

---

## React Anti-Patterns

### 17. useEffect Dependency Array Issues

```javascript
// useSpotifyPlayer.js:286
}, [getAccessToken, fetchExternalPlaybackState]);
```

`fetchExternalPlaybackState` is in the dependency array of the effect that creates it. This is a recipe for stale closures.

### 18. No Error Boundaries

If any component throws during render, the entire app crashes. Add error boundaries around major sections.

### 19. Index as Key (Minor but Wrong)

```javascript
// Stats.jsx:149
{top20Popular.map((item, i) => (
  <li key={i}>  // Should be item.track.id
```

Using array index as key breaks React's reconciliation when items are reordered.

---

## API Integration Issues

### 20. No Rate Limit Handling

Spotify's API has rate limits. There's no:
- Exponential backoff
- Rate limit detection (429 responses)
- Request queuing

Hit the limits and your app just fails.

### 21. Race Conditions

```javascript
// App.jsx:119-131
async function getValidAccessToken() {
  const expiresAt = localStorage.getItem('expires_at');
  if (parseInt(expiresAt) < Date.now() + 60 * 1000 && refreshToken) {
    const tokenData = await refreshAccessToken(refreshToken);
    saveTokens(tokenData);
    return tokenData.access_token;
  }
```

If two requests call `getValidAccessToken` simultaneously near expiry, both try to refresh. One succeeds, one may fail if Spotify invalidates the old refresh token. Need a mutex/lock.

---

## CSS Issues

### 22. Inconsistent Naming

```css
.btn--primary        /* BEM modifier */
.player-btn--primary /* Different prefix */
.stats-link--artist  /* Yet another */
.chart-stat-value--highlight /* And another */
```

Pick a naming convention and stick with it.

### 23. Variables Defined, Not Used

`src/styles/variables.css` defines 50+ CSS variables. Many components use hardcoded values instead:

```javascript
// Dashboard.jsx
const COLORS = {
  green: '#1DB954',  // This is var(--spotify-green)
```

---

## What's Actually Good

Credit where due:

1. **PKCE implementation is correct** - Proper code verifier/challenge flow
2. **Cache fallback pattern** - The idea of graceful degradation is sound (execution is flawed)
3. **Spotify brand compliance** - Uses official colors and assets correctly
4. **Player error handling** - Device ID resolution workaround for Spotify's bug is clever

---

## Summary of Required Fixes

| Priority | Issue | Effort |
|----------|-------|--------|
| P0 | Add tests | High |
| P0 | Move tokens out of localStorage | Medium |
| P0 | Add TypeScript | High |
| P1 | Extract App.jsx into services/hooks | Medium |
| P1 | Add error boundaries | Low |
| P1 | Batch artist cache reads | Low |
| P1 | Parallelize artist fetching | Low |
| P2 | Add rate limit handling | Medium |
| P2 | Reduce polling frequency | Low |
| P2 | Virtualize long lists | Medium |
| P2 | Remove magic numbers | Low |
| P2 | Strip console statements | Low |
| P3 | Refactor D3 integration | High |
| P3 | Consistent CSS naming | Medium |
| P3 | Add proper state management | Medium |

---

**Bottom line**: This is a functional prototype, not production code. The core feature works, but the codebase has significant architectural debt, security concerns, and maintainability issues. A version 2.0.0 release implies stability and maturity that simply isn't present here.

---

# Implementation Plan: Fix All Issues

> **Approach**: Incremental PRs (one per phase) with UX improvements allowed.

---

## PR 1: Foundation (Tests + TypeScript)

### 1.1 Add Vitest + Testing Infrastructure
**Files to create:**
- `vitest.config.js`
- `src/test/setup.ts`
- Update `package.json` with test scripts

**Changes:**
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @testing-library/user-event msw
```

### 1.2 Add TypeScript
**Files to modify/create:**
- `tsconfig.json`
- Rename all `.js`/`.jsx` → `.ts`/`.tsx`
- Add type definitions for Spotify API responses

**Changes:**
```bash
npm install -D typescript @types/react @types/react-dom @types/d3
```

### 1.3 Create Type Definitions
**File to create:** `src/types/spotify.ts`
- `SpotifyTrack`, `SpotifyArtist`, `SpotifyAlbum`
- `SavedTrack`, `ArtistMap`
- `TokenData`, `PlayerState`
- Spotify Web Playback SDK types

---

## PR 2: Security Fixes

### 2.1 Token Storage Refactor
**File:** `src/auth.ts` (was auth.js)

**Current (insecure):**
```javascript
localStorage.setItem('access_token', tokenData.access_token);
```

**Fix:** Use sessionStorage for access_token, keep refresh_token in localStorage with additional protections:
- Access token → sessionStorage (cleared on tab close)
- Add token refresh mutex to prevent race conditions
- Consider encrypting refresh token at rest

### 2.2 Extract CLIENT_ID to Proper Config
**File:** `src/config.ts`
```typescript
export const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
if (!SPOTIFY_CLIENT_ID) {
  throw new Error('VITE_SPOTIFY_CLIENT_ID environment variable is required');
}
```

**File:** `.env.example`
```
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
```

---

## PR 3: Architecture Refactor

### 3.1 Extract Auth Logic from App.jsx
**Files to create:**
- `src/hooks/useAuth.ts` - Token management, refresh logic
- `src/services/authService.ts` - PKCE utilities, token exchange
- `src/contexts/AuthContext.tsx` - Auth state provider

**Result:** App.tsx becomes ~50 lines instead of 337

### 3.2 Extract Data Fetching
**Files to create:**
- `src/hooks/useSpotifyTracks.ts` - Track fetching + caching
- `src/hooks/useSpotifyArtists.ts` - Artist fetching + caching
- `src/services/spotifyApi.ts` - API client with rate limiting

### 3.3 Add React Context
**Files to create:**
- `src/contexts/PlayerContext.tsx` - Player state
- `src/contexts/TracksContext.tsx` - Tracks data

### 3.4 Add Error Boundaries
**File to create:** `src/components/ErrorBoundary.tsx`

Wrap major sections:
- Dashboard
- Player
- Stats

---

## PR 4: Performance Fixes

### 4.1 Batch Cache Reads
**File:** `src/cache/SpotifyCache.ts`

**Before:**
```javascript
for (const artistId of artistIds) {
  const cached = await this._cacheService.get(STORES.ARTISTS, artistId);
}
```

**After:**
```typescript
async getCachedArtists(artistIds: string[]): Promise<CacheResult> {
  const results = await this._cacheService.getMany(STORES.ARTISTS, artistIds);
  // Process in one pass
}
```

Add `getMany` method to CacheService and adapters.

### 4.2 Parallelize Artist Fetching
**File:** `src/services/spotifyApi.ts`

**Before:** Sequential batches
**After:**
```typescript
async fetchArtistsBatch(artistIds: string[], concurrency = 3): Promise<Artist[]> {
  const batches = chunk(artistIds, 50);
  return pMap(batches, batch => this.fetchArtists(batch), { concurrency });
}
```

### 4.3 Smart Polling
**File:** `src/hooks/useSpotifyPlayer.ts`

- Poll at 1s when playing
- Poll at 10s when paused
- Stop polling when tab not visible (use `document.hidden`)
- Use Visibility API to pause/resume

### 4.4 Virtualize Lists
**Files to modify:** `src/components/Stats.tsx`

```bash
npm install @tanstack/react-virtual
```

Add virtualized rendering for Top 20 lists (and future expansion to show all tracks).

---

## PR 5: Code Quality

### 5.1 Extract Constants
**File to create:** `src/constants/index.ts`

```typescript
export const SPOTIFY = {
  BATCH_SIZE: 50,
  API_BASE: 'https://api.spotify.com/v1',
} as const;

export const CACHE = {
  TRACK_TTL_MS: 10 * 60 * 1000, // 10 minutes
  ARTIST_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

export const PLAYER = {
  POLL_INTERVAL_PLAYING_MS: 1000,
  POLL_INTERVAL_PAUSED_MS: 10000,
} as const;
```

### 5.2 Add Logger
**File to create:** `src/utils/logger.ts`

```typescript
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

export const logger = {
  debug: (...args) => import.meta.env.DEV && console.debug(...args),
  info: (...args) => import.meta.env.DEV && console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};
```

Replace all `console.*` calls with `logger.*`.

### 5.3 Remove Dead Code
- Delete `src/components/playlists.css`
- Remove unused `chartWidth`/`chartHeight` from useMemo deps
- Clean up unused imports

### 5.4 Standardize Error Handling
**File to create:** `src/utils/errors.ts`

```typescript
export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean = false
  ) {
    super(message);
  }
}

export class RateLimitError extends SpotifyApiError {
  constructor(public retryAfter: number) {
    super('Rate limited', 429, true);
  }
}
```

### 5.5 Add Rate Limiting
**File:** `src/services/spotifyApi.ts`

Handle 429 responses with exponential backoff and respect `Retry-After` header.

---

## PR 6: CSS Cleanup

### 6.1 Standardize BEM Naming
Adopt pattern: `[block]__[element]--[modifier]`

**Renames needed:**
- `.btn--primary` → Keep as-is (it's the base)
- `.player-btn--primary` → `.player__btn--primary`
- `.stats-link--artist` → `.stats__link--artist`

### 6.2 Use CSS Variables Consistently
Replace all hardcoded colors in JS with CSS variable references:

```javascript
// Before
const COLORS = { green: '#1DB954' };

// After
const COLORS = {
  green: 'var(--spotify-green)',
};
```

---

## PR 7: D3 Refactor

### 7.1 Split D3 Effect
**File:** `src/components/Dashboard.tsx`

Break 183-line useEffect into:
- `useChartScales.ts` - Scale calculations
- `useChartAxes.ts` - Axis rendering
- `useChartDataPoints.ts` - Circle rendering
- `useChartLegend.ts` - Legend rendering
- `useChartTooltip.ts` - Tooltip handling

Or consider switching to a React-D3 library like `visx`.

---

## PR 8: Write Tests

### Test Files to Create:

```
src/
├── test/
│   └── setup.ts
├── auth.test.ts
├── hooks/
│   ├── useAuth.test.ts
│   ├── useSpotifyPlayer.test.ts
│   └── useSpotifyTracks.test.ts
├── components/
│   ├── Login.test.tsx
│   ├── Dashboard.test.tsx
│   ├── Player.test.tsx
│   └── Stats.test.tsx
├── cache/
│   ├── SpotifyCache.test.ts
│   └── CacheService.test.ts
└── services/
    └── spotifyApi.test.ts
```

Target: 80%+ coverage on business logic, 60%+ overall.

---

## Progress Tracker

| PR | Title | Status | Branch |
|----|-------|--------|--------|
| 1 | Foundation (Tests + TypeScript) | 🔄 In Progress | `refactor/1-foundation` |
| 2 | Security Fixes | ⬜ Not started | `refactor/2-security` |
| 3 | Architecture Refactor | ⬜ Not started | `refactor/3-architecture` |
| 4 | Performance Fixes | ⬜ Not started | `refactor/4-performance` |
| 5 | Code Quality | ⬜ Not started | `refactor/5-code-quality` |
| 6 | CSS Cleanup | ⬜ Not started | `refactor/6-css` |
| 7 | D3 Refactor | ⬜ Not started | `refactor/7-d3` |
| 8 | Write Tests | ⬜ Not started | `refactor/8-tests` |

### Detailed Checklist

**PR 1: Foundation**
- [ ] Install Vitest + testing deps
- [ ] Create vitest.config.js
- [ ] Create src/test/setup.ts
- [ ] Install TypeScript + types
- [ ] Create tsconfig.json
- [ ] Rename all .js/.jsx → .ts/.tsx
- [ ] Create src/types/spotify.ts
- [ ] Fix all type errors
- [ ] Verify app still works

**PR 2: Security**
- [ ] Move access_token to sessionStorage
- [ ] Add token refresh mutex
- [ ] Create src/config.ts for CLIENT_ID
- [ ] Create .env.example
- [ ] Update vite.config.js to use VITE_SPOTIFY_CLIENT_ID

**PR 3: Architecture**
- [ ] Create src/services/authService.ts
- [ ] Create src/hooks/useAuth.ts
- [ ] Create src/contexts/AuthContext.tsx
- [ ] Create src/hooks/useSpotifyTracks.ts
- [ ] Create src/hooks/useSpotifyArtists.ts
- [ ] Create src/services/spotifyApi.ts
- [ ] Create src/contexts/PlayerContext.tsx
- [ ] Create src/contexts/TracksContext.tsx
- [ ] Create src/components/ErrorBoundary.tsx
- [ ] Refactor App.tsx to use new hooks/contexts
- [ ] Remove module-level state from useSpotifyPlayer

**PR 4: Performance**
- [ ] Add getMany to cache adapters
- [ ] Batch artist cache reads
- [ ] Add concurrent artist fetching
- [ ] Implement smart polling (variable interval)
- [ ] Add Page Visibility API integration
- [ ] Install @tanstack/react-virtual
- [ ] Virtualize Stats lists

**PR 5: Code Quality**
- [ ] Create src/constants/index.ts
- [ ] Replace all magic numbers
- [ ] Create src/utils/logger.ts
- [ ] Replace all console.* calls
- [ ] Delete playlists.css
- [ ] Remove unused deps from useMemo
- [ ] Create src/utils/errors.ts
- [ ] Implement rate limit handling
- [ ] Add exponential backoff

**PR 6: CSS Cleanup**
- [ ] Audit all class names
- [ ] Standardize BEM naming
- [ ] Replace hardcoded colors with CSS vars
- [ ] Clean up unused CSS

**PR 7: D3 Refactor**
- [ ] Split useEffect into focused hooks
- [ ] (Optional) Evaluate visx migration

**PR 8: Tests**
- [ ] Write auth tests
- [ ] Write hook tests
- [ ] Write component tests
- [ ] Write cache tests
- [ ] Write API service tests
- [ ] Achieve 80%+ coverage on business logic

---

## Files to Modify/Create Summary

### New Files (~25)
- `tsconfig.json`
- `vitest.config.js`
- `.env.example`
- `src/types/spotify.ts`
- `src/config.ts`
- `src/constants/index.ts`
- `src/utils/logger.ts`
- `src/utils/errors.ts`
- `src/contexts/AuthContext.tsx`
- `src/contexts/PlayerContext.tsx`
- `src/contexts/TracksContext.tsx`
- `src/hooks/useAuth.ts`
- `src/hooks/useSpotifyTracks.ts`
- `src/hooks/useSpotifyArtists.ts`
- `src/services/spotifyApi.ts`
- `src/services/authService.ts`
- `src/components/ErrorBoundary.tsx`
- `src/test/setup.ts`
- ~8 test files

### Files to Rename (→ TypeScript)
- All `.js` → `.ts`
- All `.jsx` → `.tsx`

### Files to Delete
- `src/components/playlists.css`

### Major Refactors
- `src/App.tsx` - Reduce from 337 to ~50 lines
- `src/hooks/useSpotifyPlayer.ts` - Remove module-level state
- `src/components/Dashboard.tsx` - Split D3 effect
- `src/cache/*.ts` - Add batch operations
