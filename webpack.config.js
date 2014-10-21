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
            { test: /\.scss$/, loader: 'style!css!sass!autoprefixer?browsers=last 2 versions' },
            { test: /\.(png|jpg|gif)$/, loader: 'url?limit=8912' }
        ]
    },
    resolve: {
        extensions: ['', '.js', '.json', '.jsx']
    }, 
    plugins: [
        new DefinePlugin({
            CLIENT_ID: JSON.stringify(process.env.CLIENT_ID || 'b644f355f49f4878bcdc373475838796'),
            API_BASE: JSON.stringify('https://api.spotify.com/')
        })
    ]
};
