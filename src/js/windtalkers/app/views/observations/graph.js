"use strict";

var View = require('windtalkers/framework/view');
var Rickshaw = require('rickshaw');
var Annotator = require('windtalkers/lib/rickshaw/direction_annotator');

/**
 *
 * @constructor
 */
function GraphView(attrs){
    return GraphView.prototype.create(attrs || {});
}

module.exports = View.prototype.extend(View, GraphView, {
    /**
     * Convert an array of observations to a Rickshaw.js stack.
     * @param {Array} observations
     * @returns {Array} A stack of objects - each representing a line to be drawn on graph.
     * @todo add support for translations
     */
    stack : function(observations) {
        // Reverse ordering if observations are in descending order
        if (observations.length >= 2 && observations[0].tstamp > observations[1].tstamp) {
            observations = _(observations).reverse();
        }
        return [
            {
                key: 'min',
                name: 'Min Wind Speed',
                color: "#91B4ED",
                data: _.map(observations, function(obs){
                    return {
                        x: obs.tstamp,
                        y: obs.min
                    }
                })
            },
            {
                key: 'avg',
                name: 'Average Wind Speed',
                color: "#3064B8",
                data: _.map(observations, function(obs){
                    return {
                        x: obs.tstamp,
                        y: obs.speed
                    }
                })
            },
            {
                key: 'max',
                name: 'Max Wind Speed',
                color: "#91B4ED",
                max_value: _.max(_.pluck(observations, 'max')),
                data: _.map(observations, function(obs){
                    return {
                        x: obs.tstamp,
                        y: obs.max
                    }
                })
            }
        ];
    },
    /**
     * Instantiates and configures a Rickshaw.Graph
     * @param {Array} series
     * @param {jQuery} $widget
     * @param {Object} options
     * @returns {Rickshaw.Graph}
     */
    createGraph : function(series, $widget, options){
        var graph,
            time = new Rickshaw.Fixtures.Time(),
            $scroll = $widget.find('.scroll-contents'), // sliding box
            $elem = $widget.find('.chart'), // where the graph is rendered
            width;

        var graph_max = _.last(series).max_value;

        // Set the values for Y axis if the max is under 10 m/s. Keeps graph from looking weird when all values are 0
        if (graph_max < 10) {
            options.min = options.min || 0 ;
            options.max = options.max || 10;
        } // else: values scale automatically

        // Scale after number of observations
        width = series[0].data.length *  30;
        $scroll.width(width);
        $elem.width(width).height($elem.height() || 290);
        $widget.find('.scroll-window').scrollLeft(999999);

        graph = new Rickshaw.Graph(_.defaults(options, {
            renderer: 'line',
            dotSize: 2,
            series: series,
            width: $elem.innerWidth() - 20,
            height: $elem.innerHeight() -20
        }));
        $widget.find('.y-axis').height(graph.height); // not sure why Y axis does not automatically get correct height
        return _.extend(graph, {
            axes: {
                x : new Rickshaw.Graph.Axis.Time({
                    element: $widget.find('.x-axis')[0],
                    graph: graph,
                    timeUnit: time.unit('15 minute')
                }),
                y: new Rickshaw.Graph.Axis.Y( {
                    element: $widget.find('.y-axis')[0],
                    graph: graph,
                    orientation: 'left',
                    tickFormat: function(y){
                        return y + ' m/s'
                    }
                })
            },
            annotator: new Annotator({
                graph: graph,
                element: $widget.find('.timeline')[0],
                data: series
            })
        });
    },
    /**
     * @type {Function}
     */
    template: _.template(
        '<% if (this.station) {  %>' +
        '<h2 class="station-name"><%= this.station.name %></h2>' +
        '<% } %>' +
        '<div class="graph">' +
            '<div class="y-axis"></div>' +
            '<div class="scroll-window">' +
                '<div class="scroll-contents">' +
                    '<div class="chart">' +
                        '<div class="timeline">' +
                            '<div class="x-axis"></div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>'
    )
});