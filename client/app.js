/** @jsx React.DOM */

var qs = require('querystring');
var reqwest = require('reqwest');

var trackCollection, playlistCollection;

if (window.location.hash) {
    var data = qs.parse(window.location.hash.slice(1));

    if (data.error) {
        //handle error
    } else {
        //handle success
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('expires_at', Date.now() + (data.expires_in*1000));
    }
}

if (!localStorage.getItem('access_token') || localStorage.getItem('expires_at') < Date.now()) {
    require.ensure([], function() {
        var Login = require('./components/login');
        var React = require('react');
        React.renderComponent(Login(), document.body);
    });
} else {
    loadCollection(API_BASE + 'v1/me/tracks?offset=0&limit=50', function(err, tracks) {
        if (err && err.status === 401) {
            console.log(err);
            localStorage.clear();
            window.location.href = window.location.protocol + '//' + window.location.host;
        }
        trackCollection = tracks;
        renderDashboard()
    });

    // loadCollection(API_BASE + 'v1/users/shapshankly/playlists?offset=0&limit=50', function(err, playlists) {
    //     if (err && err.status === 401) {
    //         console.log(err);
    //         localStorage.clear();
    //         window.location.href = window.location.protocol + '//' + window.location.host;
    //     }
    //     playlistCollection = playlists;
    //     renderDashboard();
    // });

    renderDashboard();
}


function renderDashboard() {
    require.ensure([], function() {
        var React = require('react');
        var Dashboard = require('./components/dashboard')
        React.renderComponent(Dashboard({
            tracks: trackCollection,
            playlists: playlistCollection
        }), document.body);
    });
}

function loadCollection(url, cb) {

    var collection = [];
    getData(url, saveCollection);

    function saveCollection(data) {
        if (data.status && data.status !== 200) {
            console.log('failed');
            console.log({error: data.statusText, status: data.status});
           return cb({error: data.statusText, status: data.status}); 
        }

        if (data.items) {
            collection = collection.concat(data.items);
        }

        if (data.next) {
            getData(data.next, saveCollection);
        } else {
            cb(null, collection);
        }
    }
}

function getData(url, cb) {
    reqwest({
        url: url,
        contentType: 'application/json',
        crossOrigin: true,
        headers: {
            "Authorization": 'Bearer ' + localStorage.getItem('access_token')
        }
    }).then(cb).fail(cb);
}
