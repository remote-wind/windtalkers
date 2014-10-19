"use strict";

var Widget = require('windtalkers/framework/widget');
var ObservationsController = require('windtalkers/app/controllers/observations_controller');
var GraphView = require('windtalkers/app/views/observations/graph');
/**
 *
 * @constructor
 */
function GraphWidget(attrs){
    return GraphWidget.prototype.create(attrs || {});
}
module.exports = Widget.prototype.extend(Widget, GraphWidget, {
    name: 'GraphWidget',
    selector: '.graph-widget',
    /**
     * Called when container starts up widget - should return a new widget instance
     * @param {jQuery} $elem
     * @param {String|Integer} stationId
     * @returns {GraphWidget}
     */
    startUp: function($elem, stationId){
        var controller, promise;
        stationId = stationId || $elem.data('stationId');
        controller = ObservationsController($elem);
        promise = controller.index(stationId, GraphView());

        // Initialize graph
        promise.then(function(state){
            state.graph = state.view.createGraph(
                state.view.stack( state.observations ),
                state.rendered,
                {
                    element: state.rendered.find('.chart')[0]
                }
            );
            state.graph.render();
            state.annotations = state.graph.annotator.update(state.observations);
            return state;
        });
        return GraphWidget.prototype.create({
            controller: controller,
            promise: promise
        });
    }
});