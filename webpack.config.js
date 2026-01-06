var webpack = require('webpack');
var DefinePlugin = require('webpack/lib/DefinePlugin');

module.exports = {
    entry: { 
        main: './client/app.js'
    },
    output: {
        path: __dirname + '/build/assets/',
        filename: '[name].js',
        publicPath: '/assets'
    },
    module: {
        loaders: [
            { test: /\.js$/, loader: 'jsx?harmony' },
            { test: /\.css$/, loader: 'style!css!autoprefixer?browers=last 2 versions' },
            { test: /\.(png|jpg|gif)$/, loader: 'url?limit=8912' }
        ]
    },
    resolve: {
        extensions: ['', '.js', '.json', '.jsx', '.png', '.css']
    }, 
    plugins: [
        new DefinePlugin({
            SPOTIFY_SECRET: JSON.stringify(process.env.SPOTIFY_SECRET || '133544a42ef94dddb720c875752e0a63'),
            CLIENT_ID: JSON.stringify(process.env.CLIENT_ID || 'b644f355f49f4878bcdc373475838796'),
            API_BASE: JSON.stringify('https://api.spotify.com/'),
            DEV: JSON.stringify(process.env.NODE_ENV || true)
        })
    ]
};
