var express = require('express'),
    _ = require('lodash'),
    qs = require('querystring'),
    bodyParser = require('body-parser'),
    session = require('cookie-session'),
    fs = require('fs'),
    request = require('request');

var app = express();
var AUTH_URL = 'https://accounts.spotify.com/authorize';
var TOKEN_URL = 'https://accounts.spotify.com/api/token';
var LIBRARY_URL = 'https://api.spotify.com/v1/me/tracks';

var webpack = require('webpack');
var webpackConfig = require('./webpack.config');
var webpackMiddleware = require('webpack-dev-middleware');

app.use(webpackMiddleware(webpack(webpackConfig),{
    publicPath: '/assets'                         
}));

app.set('query parser', 'extended');

app.use(session({ keys: ['key1', 'key2'] }));
app.use(bodyParser.json());

app.get('/*', function(req, res) {
   return fs.createReadStream('./build/index.html').pipe(res); 
});

app.listen(3000, function(err) {
    console.log('listening on port 3000');          
});
