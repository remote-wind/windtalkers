"use strict";

var Controller = require('windtalkers/framework/controller');
var MapView = require('windtalkers/app/views/stations/map');

/**
 *
 * @param {jQuery} $elem
 * @constructor
 */
function StationsController($elem){
   return StationsController.prototype.create({
       element : $elem
   });
}

module.exports = Controller.prototype.extend(Controller, StationsController, {
    /**
     * Show all stations
     * @param {View} view
     * @returns {Object} a promise
     */
    index : function(view){
        var controller = this,
            promise = $.when(
                this.client.getStations(),
                jQuery.getScript('https://maps.googleapis.com/maps/api/js')
            );

        return promise.then(function(stations, google){
            view = view || MapView(google);

            return {
                element: controller.element,
                view: view,
                rendered: view.render({
                    stations: stations
                })
            }
        }).then(function(state){
            controller.element.empty();
            controller.element.append(state.rendered);
            return state;
        });
    }
});