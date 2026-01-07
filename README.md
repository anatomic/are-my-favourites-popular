# Are My Favourites Popular?

A React app that visualizes the popularity of your Spotify saved tracks over time. Discover trends in your music taste, find your most niche tracks, and see which artists dominate your library.

![Spotify](https://img.shields.io/badge/Spotify-1DB954?style=flat&logo=spotify&logoColor=white)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat&logo=react&logoColor=white)
![D3.js](https://img.shields.io/badge/D3.js-v7-F9A03C?style=flat&logo=d3.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=flat&logo=vite&logoColor=white)

## Features

- **Interactive Scatter Plot** — Visualize all your saved tracks by date added vs. popularity score, with bubble size reflecting popularity
- **Playback Integration** — Click any track to play it (Spotify Premium required)
- **Library Stats** — See your top 20 most popular tracks, most niche discoveries, favourite artists, and genre breakdown
- **Sorting & Filtering** — Sort artists and genres by track count or average popularity
- **Yearly Summary** — Track your listening habits year by year with highlighted milestones
- **Smart Caching** — Reduces API calls with IndexedDB/localStorage caching
- **No Backend Required** — Uses Spotify's Authorization Code with PKCE flow

## Screenshots

| Chart View                                                  | Library Stats                            |
| ----------------------------------------------------------- | ---------------------------------------- |
| Interactive scatter plot showing track popularity over time | Top tracks, artists, genres with sorting |

## Getting Started

### Prerequisites

- Node.js 18+
- A Spotify account
- A [Spotify Developer](https://developer.spotify.com/dashboard) app with Client ID

### Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/anatomic/are-my-favourites-popular.git
   cd are-my-favourites-popular
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure Spotify Client ID**

   Create your app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and add `http://localhost:3000` as a Redirect URI.

   Set your Client ID via environment variable:

   ```bash
   CLIENT_ID=your_client_id npm run dev
   ```

   Or update `vite.config.js` directly.

4. **Start the development server**

   ```bash
   npm run dev
   ```

5. **Open** [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
npm run build
npm run preview  # Preview the build locally
```

## How It Works

1. **Authentication** — OAuth 2.0 with PKCE (no backend server needed)
2. **Data Fetching** — Retrieves all saved tracks via paginated Spotify API calls
3. **Caching** — Stores tracks and artist data in IndexedDB (falls back to localStorage)
4. **Visualization** — D3.js renders an interactive SVG scatter plot
5. **Playback** — Spotify Web Playback SDK transfers playback to the browser

### Spotify Scopes Used

- `user-read-private` — Check Premium status
- `user-library-read` — Fetch saved tracks
- `user-read-playback-state` — Get current playback
- `user-modify-playback-state` — Control playback
- `streaming` — Web Playback SDK

## Project Structure

```
src/
├── App.jsx              # Main app, OAuth callback handling
├── auth.js              # PKCE utilities, token management
├── main.jsx             # React entry point
├── cache/               # Caching layer (IndexedDB, localStorage, memory)
├── components/
│   ├── Dashboard.jsx    # Chart + player integration
│   ├── Login.jsx        # Spotify login button
│   ├── Player.jsx       # Playback controls
│   └── Stats.jsx        # Library statistics
├── hooks/
│   └── useSpotifyPlayer.js  # Web Playback SDK hook
└── styles/              # Global CSS variables
```

## Tech Stack

- **React 18** — UI framework
- **Vite** — Build tool and dev server
- **D3.js** — Data visualization
- **Spotify Web API** — Track and artist data
- **Spotify Web Playback SDK** — In-browser playback

## Code Quality

This project uses ESLint and Prettier to maintain code quality and consistent formatting.

### Linting & Formatting Commands

```bash
npm run lint          # Check for linting issues
npm run lint:fix      # Fix linting issues automatically
npm run format        # Format all files with Prettier
npm run format:check  # Check formatting without changes
npm run check         # Run all checks (lint + format + typecheck)
```

### Pre-commit Hooks

The project uses [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged) to automatically lint and format staged files before each commit:

- **JS/TS files** — ESLint fix + Prettier format
- **JSON/CSS/MD files** — Prettier format

This ensures all committed code meets the project's quality standards.

### ESLint Configuration

- TypeScript-aware linting with `@typescript-eslint`
- React and React Hooks rules
- Prettier integration (formatting rules disabled in ESLint)
- Unused variable patterns: prefix with `_` to ignore (e.g., `_unusedVar`)

### Prettier Configuration

- Single quotes, trailing commas (ES5), semicolons
- 100 character line width
- 2 space indentation
- Arrow function parentheses always included

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the [MIT License](LICENSE).

**Important:** This license applies only to the source code in this repository. Use of the Spotify Platform (API, SDK) requires your own Spotify Developer account and agreement to [Spotify's Developer Terms](https://developer.spotify.com/terms). See [NOTICE](NOTICE) for details.

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Spotify AB. Spotify is a registered trademark of Spotify AB.

## Acknowledgements

- [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- [Spotify Design Guidelines](https://developer.spotify.com/documentation/design)
- [D3.js](https://d3js.org/)

---

Made with love by [@anatomic](https://twitter.com/anatomic)
