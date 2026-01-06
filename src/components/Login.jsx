import { generateCodeVerifier, generateCodeChallenge } from '../auth';

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
    <div>
      <h1>Are my favourites Popular?</h1>
      <button onClick={handleLogin} className="btn btn--login">
        Login with Spotify
      </button>
    </div>
  );
}

export default Login;
