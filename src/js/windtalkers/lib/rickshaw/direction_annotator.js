"use strict";
var Rickshaw = require('rickshaw');

Rickshaw.namespace('Rickshaw.Graph.DirectionAnnotator');
/**
 * Graph annotations for Rickshaw which display wind direction.
 * @param {Object} args
 * @constructor
 */
Rickshaw.Graph.DirectionAnnotator = function(args) {
    var graph = this.graph = args.graph;
    var self = this;
    this.data = args.data || {};
    this.elements = { timeline: args.element };
    this.elements.timeline.classList.add('rickshaw-direction-timeline');
    /**
     * Renders arrows under each data point in graph
     * @param {Array} observations
     * @returns {jQuery} the timeline element.
     */
    this.update = function(observations) {

        var timeline, annotations;

        timeline = $(this.elements.timeline);
        timeline.empty();

        // Create an arrow for each observation.
        annotations = _.map(observations, function(observation){
            return $('<div class="arrow">')
                .attr('title', observation.degreesAndCardinal().replace('&thinsp;', ' '))
                .css({
                    transform: 'rotate(' + observation.direction + 'deg)',
                    left: self.graph.x(observation.tstamp)
                });
        });

        return timeline.append(annotations);
    };
    this.graph.onUpdate( function() { self.update() } );
};

module.exports = Rickshaw.Graph.DirectionAnnotator;