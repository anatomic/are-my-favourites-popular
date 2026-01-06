/** @jsx React.DOM */

var React = require('react');
var main = require('./main.css');
var _ = require('lodash');
var maxWidth = window.innerWidth - 100;
var maxHeight = window.innerHeight - 200;


module.exports = React.createClass({
    displayName: 'Dashboard',
    componentDidUpdate: function() {
        if (this.props.tracks) {
            var tracks = this.props.tracks.sort(_sort);
            var container = this.refs.d3Container.getDOMNode();

            //init d3
            require.ensure([], function() {

                var d3 = require('d3');
                var axis = require('./graph.css');

                var first = d3.min(tracks, function(d) { return new Date(d.added_at) });
                var last = d3.max(tracks, function(d) { return new Date(d.added_at) });

                var cumulativePopularity = d3.nest()
                .key(function(d) { return d3.time.week(new Date(d.added_at)) })
                .rollup(function(leaves) { return { 
                    total_popularity: d3.sum(leaves, function(d) { return d.track.popularity }),
                    total_tracks: leaves.length 
                }})
                .entries(tracks);

                var sum = 0;
                var totalTracks = 0;
                cumulativePopularity.forEach(function(leaf, i) {
                    sum += leaf.values.total_popularity
                    totalTracks += leaf.values.total_tracks;
                    leaf.values.cumulative_total = sum;
                    leaf.values.moving_mean = totalTracks && sum ? sum / totalTracks : sum;
                    leaf.values.mean = leaf.values.total_popularity / leaf.values.total_tracks;
                });

                var totalPopularity = d3.sum(cumulativePopularity, function(d) { return d.values.total_popularity });
                // totalPopularity = d3.max(cumulativePopularity, function(d) { return d.values.total_popularity });

                var r = d3.scale.pow().exponent(2).domain([0, 100]).range([1, 20]);
                var x = d3.time.scale().domain([first, last]).rangeRound([40, (maxWidth)]).nice();
                var y = d3.scale.linear().domain([d3.max(tracks, function(d) { return d.track.popularity }) + 5, 0]).range([20, maxHeight]);
                var y2 = d3.scale.linear().domain([d3.max(cumulativePopularity, function(d) { return d.values.moving_mean }) + 5, 0]).range([20, maxHeight]);
                var col = d3.scale.category20c();

                var xAxis = d3.svg.axis().scale(x).orient('bottom').ticks(d3.time.week, 2);
                var yAxis = d3.svg.axis().scale(y).orient('left');
                var yAxis2 = d3.svg.axis().scale(y2).orient('right');

                var av = d3.mean(tracks, function(d) { return d.track.popularity });

                var cumulativeLine = d3.svg.line()
                    .interpolate('basis')
                    .x(function(d) { return x(new Date(d.key)); })
                    .y(function(d) { return y(d.values.moving_mean) });

                var weeklyMean = d3.svg.line()
                    .interpolate('basis')
                    .x(function(d) { return x(new Date(d.key)); })
                    .y(function(d) { return y(d.values.mean) });

                var cumulativeArea = d3.svg.area()
                    .interpolate('basis')
                    .x(function(d) { return x(new Date(d.key)); })
                    .y1(function(d) { return y(d.values.moving_mean)})
                    .y0(maxHeight);
                

                d3.select(container).append('path').attr('d', cumulativeArea(cumulativePopularity))
                    .attr({
                        fill: '#74C476',
                        opacity: 0.05
                    });
                d3.select(container).append('path').attr('d', cumulativeLine(cumulativePopularity)).attr(
                    {
                        fill: 'none',
                        stroke: '#74C476',
                        'stroke-width': '2px',
                        opacity: 0.4,
                        id: 'cumulativeTotal'
                });

                d3.select(container).append('path').attr('d', weeklyMean(cumulativePopularity)).attr({
                    fill: 'none',
                    stroke: '#ccc',
                    'stroke-dasharray': '3,5',
                    opacity: 0.8
                });

                var text = d3.select(container).append('text').attr({'dy': -4, 'dx': maxWidth * 0.666}).attr('text-anchor', 'right').attr('x', 10).classed('line-label', true);
                text.append('textPath').attr('xlink:href', '#cumulativeTotal').attr('text-anchor', 'right').text('Moving Average');

                // Axes
                d3.select(container).append('g').attr('transform', 'translate(0,' + maxHeight + ')').call(xAxis);
                // d3.select(container).append('g').attr('transform', 'translate(' + maxWidth  + ',0)').call(yAxis2);
                d3.select(container).append('g').attr('transform', 'translate(40,0)').call(yAxis);

                // Data points
                d3.select(container).selectAll('circle')
                .data(tracks).enter()
                .append('circle')
                .attr({
                    r: function(d) { return r(d.track.popularity) },
                    cx: function(d, i) { return x(d3.time.week(new Date(d.added_at))) },
                    cy: function(d) { return y(d.track.popularity) },
                    fill: function(d, i) { return col(i); }
                })
                .on('mousedown', function(e) {
                   e.audio=  new Audio(e.track.preview_url);
                    e.audio.play();
                })
                .on('mouseup', function(e) {
                    e.audio.pause();    
                })
                .append('title')
                .text(function(d) { return d.track.artists[0].name + ' - ' + d.track.name; });


                d3.select(container).append('line').attr({x1: 40, x2: maxWidth, y1: y(av), y2: y(av), stroke: '#FDAE6B', "stroke-dasharray": [3,3]});

                d3.select(container).append('text').attr({x: 40, y: y(av), dx: 4, dy: -4}).classed('line-label', true).text('Average popularity: ' + av.toFixed(2));

                    
            });
        }
    },

    _logOut: function() {
        localStorage.clear();
        window.location.href = window.location.protocol + '//' + window.location.host;
    },

    render: function() {
        var playlists = require('./playlists.css');
        if (this.props.playlists) {
            var playlistGroups = _.compact(this.props.playlists.map(function(list, i, original) {
                if (i % 5 === 0) {
                    return original.slice(i, i+5);
                }
            }));
        }

        return (
            <div>
                <h1>Are my favourites popular?</h1>
                { this.props.tracks ? 
                    <div>
                        <svg ref="d3Container" width="100%" height={maxHeight + 50}></svg>
                    </div>
                :
                <div>Loading Tracks</div>
                }
                { this.props.playlists ?
                    <div>
                    <h3>Playlists</h3>
                        <ul className="playlists">
                            {playlistGroups.map(function(group) {
                                return (
                                    <div className="playlist-group">
                                        {group.map(function(list) {
                                            return (
                                            <li key={list.name} className="playlist">{list.name}</li>
                                            )
                                        })
                                        }
                                    </div>
                                    )
                                })
                            }
                        </ul>
                    </div>
                    :
                    null
                }
                <a onClick={this._logOut} className="btn btn--login">Log out</a>
            </div>
        )
    }
});

function _sort(a,b) {
    return (new Date(a.added_at)).getTime() - (new Date(b.added_at)).getTime();
}
