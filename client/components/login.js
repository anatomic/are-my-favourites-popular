/** @jsx React.DOM */

var React = require('react');
var qs = require('querystring');
var main = require('./main.scss');

// var btn = require('./generic/btn.scss');

module.exports = React.createClass({
    displayName: 'Login',

    _login: function(){
        var opts = {
            client_id: CLIENT_ID,
            response_type: 'token',
            state: 'amfp',
            scope: 'user-read-private user-library-read playlist-read-private',
            redirect_uri: window.location.href,
            show_dialog: true
        };

        var url = 'https://accounts.spotify.com/authorize?' + qs.stringify(opts);

        window.location.href = url;
    },

    render: function() {
        return (
            <div>
                <h1>Are my favourites Popular?</h1>
                <a onClick={this._login} className="btn btn--login">Login with Spotify</a>
            </div>
        )
    }
});
