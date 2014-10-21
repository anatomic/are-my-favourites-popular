var express = require('express'),
    _ = require('lodash'),
    qs = require('querystring'),
    bodyParser = require('body-parser'),
    session = require('cookie-session'),
    request = require('request');

var app = express();

var SPOTIFY_SECRET='133544a42ef94dddb720c875752e0a63';
var SPOTIFY_CLIENT_ID='b644f355f49f4878bcdc373475838796';

var AUTH_URL = 'https://accounts.spotify.com/authorize';
var TOKEN_URL = 'https://accounts.spotify.com/api/token';
var LIBRARY_URL = 'https://api.spotify.com/v1/me/tracks';

app.set('query parser', 'extended');

app.use(session({ keys: ['key1', 'key2'] }));
app.use(bodyParser.json());

app.get('/', function(req, res) {
    if (req.session.access_token) {
        getUserLibraryData(req.session.access_token, function(e, data) {
            if (e) {
                if (e.status === 401) {
                    API.refreshToken();
                }
            }

            if (data.length) {
                var total = data.reduce(function(sum, item) {
                    return sum + item.track.popularity; 
                }, 0);

                res.send('Average popularity = ' + (total/data.length).toFixed(2));
            } else {
                res.send('You don\'t have any tracks saved to your library!');
            }

        })
    } else {
        var opts = {
            client_id: SPOTIFY_CLIENT_ID,
            response_type: 'code',
            redirect_uri: 'http://localhost:3000/auth',
            state: 'test',
            scope: 'user-read-private user-library-read',
            show_dialog: true
        };

        res.redirect(AUTH_URL + '?' + qs.stringify(opts));
    }

});

app.get('/auth', function(req, res) {
    var code = req.query.code;
    var state = req.query.state;
    var error = req.query.error;
    var session = req.session;

    var opts = {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: 'http://localhost:3000/auth',
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_SECRET
    };

    if (error) {
        return res.send(error);
    }

    if (code && state) {
        request.post({
            url: TOKEN_URL,
            form: opts,
            json: true
        }, function(e, r, body) {
            if (e) {
                return res.send(e);
            }

            session.access_token = body.access_token;
            session.refresh_token = body.refresh_token;
            session.expires_at = Date.now() + (body.expires_in * 1000);

            res.redirect('/');
        });
    }
});

function getUserLibraryData(token, cb) {
    var data = [];

    var url = LIBRARY_URL + '?' + qs.stringify({limit: 50, offset: 0});

    /**
     * recursively get all the saved tracks a user has
     *
     */
    function getData(url) {
        request.get({
            url: url,
            auth: {
                bearer: token
            },
            json: true,
            proxy: 'http://localhost:4567',
            strictSSL: false
        }, function(e, r, body) {
            if (e)  {
                return cb(e, null);
            }   

            if (body.error && body.error.status === 401) {
                return cb(body.error);
            }

            data = data.concat(body.items);
            
            if (body.next) {
                getData(body.next);
            } else {
                return cb(null, data);
            }
        });
    }

    getData(url);
}

app.listen(3000, function(err) {
    console.log('listening on port 3000');          
});
