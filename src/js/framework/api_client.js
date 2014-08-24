'use strict';

var Station = require('windtalkers/app/models/station');
var Observation = require('windtalkers/app/models/observation');

/**
 * API client talks to the blast.nu json rest api via ajax.
 * This should be the ONE AND ONLY point of outside contact.
 *
 * Most methods return a promise
 * (a plain javascript object with has the Common JS Promise/A interface)
 * which can be tapped into or you can simply specify a callback with `.done`
 * @see http://api.jquery.com/Types/#jqXHR
 * @see http://wiki.commonjs.org/wiki/Promises
 *
 * The API client takes the JSON response and converts to models though piping.
 *
 * @param {Object} options
 * @constructor
 * @see http://wiki.commonjs.org/wiki/Promises
 */
function ApiClient(){
    /**
     * Get all stations
     * @returns {object} a Promise object.
     */
    this.getStations = function(){
        var promise = jQuery.ajax({
            dataType: 'json',
            url: '/stations.json'
        });
        return promise.then(function(data){
            return _.map(data, function(s){
                return Station(s);
            });
        });
    };
    /**
     * Get a station
     * @param {string|number} id can either be an id or a slug
     * @returns {object} a Promise object
     */
    this.getStation = function(id) {
        var promise = jQuery.ajax({
            dataType: 'json',
            url: '/stations/%id.json'.replace('%id', id)
        });
        // Converts data response to Station
        return promise.then(function(data){
            return Station(data);
        });
    };
    /**
     * Gets observations for a given station.
     * @param {string|number} station_id can either be an id or a slug
     * @returns {object} a Promise object
     */
    this.getObservations = function(station_id){
        var promise = $.ajax({
            dataType: 'json',
            url:'/stations/%id/observations.json'.replace('%id', station_id)
        });
        return promise.then(function(data){
            return _.map(data, function(obj){
                return Observation(obj);
            });
        });
    };
}

module.exports = ApiClient;