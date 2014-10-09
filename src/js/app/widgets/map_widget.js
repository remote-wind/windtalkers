"use strict";

var Widget = require('windtalkers/framework/widget');
var StationsController = require('windtalkers/app/controllers/stations_controller');
var MapView = require('windtalkers/app/views/stations/map');

/**
 * Widget that displays wind observations in reverse chronological order
 * @constructor
 */
function MapWidget(attrs){
    return MapWidget.prototype.create(attrs || {});
}

module.exports = Widget.prototype.extend(Widget, MapWidget, {
    name: "MapWidget",
    selector: '.map-widget',
    /**
     * @param {jQuery} $elem
     * @param {String|Number} stationId
     * @returns {TableWidget}
     */
    startUp: function($elem, stationId){
        var controller = StationsController($elem);
        var promise;
        var apiLoaded = jQuery.Deferred();
        jQuery.getScript('https://www.google.com/jsapi', function(){
            google.load('maps', '3', { other_params: 'sensor=false', callback: function(){
                apiLoaded.resolve();
            }});
        });
        promise = $.when(
            apiLoaded,
            controller.index(MapView())
        );
        promise.done(function(api, state){
            var view = state.view;

            console.log(state);

            state.map = view.createMap(state.element);
            view.updateMap(state);
            return state;
        });
        return MapWidget({
            controller : controller,
            promise : promise
        });
    }
});