"use strict";

var Extendable = require('windtalkers/framework/extendable');

/**
 * The Alpha & Omega of object creation
 * @constructor
 */
function Creator(){}

module.exports = Extendable.prototype.extend(Extendable, Creator, {
    /**
     * Creates a new instance of the controller with props as properties.
     * @param {Object|Function} props
     *  functions should have the folling signature.
     *      function({Object} instance) -> {Object}
     * @returns {Object} a new model instance
     */
    create : function(props){
        var instance = Object.create(this);
        if (_.isFunction(props)) {
            props = props.call(this, instance);
        }
        return _.extend(instance, props || {});
    }
});