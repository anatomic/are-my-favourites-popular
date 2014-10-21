var Store = require('./Store');
var AppDispatcher = require('../dispatcher/AppDispatcher');
var _ = require('lodash');

var _tracks = {};

var TrackStore = new Store();

TrackStore.getAll = function() {
    return Object.keys(_tracks).map(TrackStore.get);
};

TrackStore.get = function(id) {
    return _tracks[id];
}

TrackStore.getAveragePopularity = function() {
    var t = TrackStore.getAll();
    return t.reduce(function(sum, track) { return sum + track.popularity}, 0) / t.length;
}

TrackStore.token = AppDispatcher.register(actionHandler);

module.exports = window.TrackStore = TrackStore;

function _addTrack(rawTrack) {
    _tracks[rawTrack.id] = rawTrack;
}

function actionHandler(action) {
    switch (action.type) {
        case 'LOAD_TRACKS':
            action.tracks.map(_addTrack);
            TrackStore.emitChange();
            console.log('all tracks loaded'); 
            break;
    }
};

