'use strict';
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
 * @param {object} options
 * @constructor
 * @see http://wiki.commonjs.org/wiki/Promises
 */
function ApiClient(){
    /**
     * Get all stations
     * @returns {object} a Promise object.
     */
    this.getStations = function(){
        return jQuery.ajax({ url: '/stations.json' });
    };
}

module.exports = ApiClient;