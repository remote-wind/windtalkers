"use strict";

var Model = require('windtalkers/framework/model');
/**
 * @constructor does not require use of `new` keyword.
 */
function Station(attrs){

    attrs = attrs || {};

    // "super" constructor call
    return Station.prototype.create(attrs);
}



Model.prototype.extend(Station);
module.exports = Station;