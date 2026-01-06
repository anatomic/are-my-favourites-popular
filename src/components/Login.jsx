function Login() {
  function handleLogin() {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'token',
      state: 'amfp',
      scope: 'user-read-private user-library-read playlist-read-private',
      redirect_uri: window.location.origin + window.location.pathname,
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
