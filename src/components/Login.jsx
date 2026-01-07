import { generateCodeVerifier, generateCodeChallenge } from '../auth';
import './login.css';

// Spotify icon SVG (from official brand assets)
const SpotifyIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

function Login() {
  async function handleLogin() {
    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store code verifier for later token exchange
    sessionStorage.setItem('code_verifier', codeVerifier);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: window.location.origin + window.location.pathname,
      scope: 'user-read-private user-library-read playlist-read-private',
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      show_dialog: 'true',
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  }

  return (
    <div className="login">
      <div className="login-content">
        <h1 className="login-title">
          Are my favourites<br />
          <span className="text-green">Popular?</span>
        </h1>
        <p className="login-description">
          Discover how your saved tracks compare to global listening trends.
          Visualize your music taste over time and uncover hidden gems in your library.
        </p>
        <button onClick={handleLogin} className="btn btn--login">
          <SpotifyIcon />
          Continue with Spotify
        </button>
        <p className="login-disclaimer">
          We only read your saved tracks. Your data stays private.
        </p>
      </div>
      <div className="login-footer">
        <p>
          Built with the{' '}
          <a
            href="https://developer.spotify.com/documentation/web-api"
            target="_blank"
            rel="noopener noreferrer"
          >
            Spotify Web API
          </a>
        </p>
      </div>
    </div>
  );
}

export default Login;
