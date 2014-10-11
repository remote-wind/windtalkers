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
    /**
     * Called when container starts up widget - should return a new widget instance
     * @param {jQuery} $elem
     * @param {String|Integer} stationId
     * @returns {GraphWidget}
     */
    startUp: function($elem, stationId){
        var controller = ObservationsController($elem);
        return GraphWidget.prototype.create({
            controller: controller,
            promise: controller.index(stationId, GraphView())
        });
    }
});