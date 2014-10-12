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
     */
    stack : function(observations) {
        return [
            {
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
                name: 'Max Wind Speed',
                color: "#91B4ED",
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
     * @param {jQuery} template
     * @param {Object} options
     * @returns {Rickshaw.Graph}
     */
    createGraph : function(series, template, options){
        var graph,
            time = new Rickshaw.Fixtures.Time(),
            $scroll = template.find('.scroll-contents'), // sliding box
            $elem = template.find('.chart'), // where the graph is rendered
            width;

        // Scale after number of observations
        width = series[0].data.length *  30;
        $scroll.width(width);
        // @todo set height dynamically
        $elem.width(width).height(290);
        template.find('.scroll-window').scrollLeft(999999);

        graph = new Rickshaw.Graph(_.defaults(options || {}, {
            renderer: 'line',
            dotSize: 2,
            series: series,
            width: $elem.innerWidth() - 20,
            height: $elem.innerHeight() - 20
        }));

        return _.extend(graph, {
            axes: {
                x : new Rickshaw.Graph.Axis.Time({
                    element: template.find('.x-axis')[0],
                    graph: graph,
                    timeUnit: time.unit('15 minute')
                }),
                y: new Rickshaw.Graph.Axis.Y( {
                    element: template.find('.y-axis')[0],
                    graph: graph,
                    orientation: 'left',
                    tickFormat: function(y){
                        return y + ' m/s'
                    }
                })
            },
            annotator: new Annotator({
                graph: graph,
                element: template.find('.timeline')[0],
                data: series
            })
        });
    },
    /**
     * Draw the arrows indicating wind direction.
     * @param {Rickshaw.Graph} graph
     * @param {Array} observations
     */
    annotate : function(graph, observations){
        graph.annotator.update(observations);
    },
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