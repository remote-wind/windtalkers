"use strict";

var Model = require('windtalkers/framework/model');

/**
 *
 * @param {Object} attrs
 * @returns {Observation}
 * @constructor does not need new keywod.
 */
function Observation(attrs){
    return Observation.prototype.create(attrs);
}

Model.prototype.extend(Observation);
module.exports = Observation;