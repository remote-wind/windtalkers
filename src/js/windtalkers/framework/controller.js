"use strict";

var ApiClient = require('windtalkers/framework/api_client');
var Creator = require('windtalkers/framework/creator');

/**
 *
 * @constructor
 */
function Controller(){}

module.exports = Creator.prototype.extend(Creator, Controller, {
    client: new ApiClient()
});