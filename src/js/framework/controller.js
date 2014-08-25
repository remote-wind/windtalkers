"use strict";

var ApiClient = require('windtalkers/framework/api_client');

function Controller(){}

_.extend(Controller.prototype, {
    /**
     * Creates a new instance of the controller with attrs as properties.
     * @param {Object} attrs
     * @returns {Object} a new model instance
     */
    create : function(attrs){
        return _.extend(Object.create(this), attrs);
    },
    /**
     * Extend "subclasses" with controller methods
     * @param {Function} constructor
     * @param {Object} extras - additional properties to add to prototype
     * @returns {Function}
     */
    extend: function(constructor, extras){
        constructor.prototype = Object.create(Controller.prototype);
        constructor.prototype.constructor = constructor;
        if (extras) {
            constructor.prototype = _.extend(constructor.prototype, extras);
        }
        return constructor;
    },
    client: new ApiClient()
});

module.exports = Controller;