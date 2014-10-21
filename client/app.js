/** @jsx React.DOM */
var react = require('react');
var d3 = require('d3');
var AppDispatcher = require('./dispatcher/AppDispatcher');

AppDispatcher.dispatch({
    type: 'LOAD_TRACKS',
    tracks: [
        { id: 1, name: 'Motorcycle Emptiness', popularity: 10 },
        { id: 2, name: 'Happy', popularity: 60 }
    ]
});
