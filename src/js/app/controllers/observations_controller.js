"use strict";

var Controller = require('windtalkers/framework/controller')
var TableView = require('windtalkers/app/views/observations/table');
/**
 *
 * @param {jQuery} $elem
 * @returns {ObservationController} instance
 * @constructor
 */
function ObservationController($elem){
    return ObservationController.prototype.create({
        element: $elem
    });
}

module.exports = Controller.prototype.extend(ObservationController, {
    /**
     * Get observations for station.
     * @param {String|Number} stationId
     * @param {View} view - optional
     * @returns {Object} a promise
     */
    index: function(stationId, view){
        var controller = this;
        var view = view || TableView();
        var promise = $.when(this.client.getObservations(stationId), this.client.getStation(stationId));
        return promise.then(function(observations, station){
            return {
                element: controller.element,
                view: view,
                rendered: view.render({
                    observations: observations,
                    station: station
                }),
                observations: observations,
                station: station
            }
        }).then(function(state){
            controller.element.empty();
            controller.element.append(state.rendered);
            return state;
        });
    }
});