"use strict";

function Widget(){}

_.extend(Widget.prototype, {
    /**
     * Creates a new instance of the widget with attrs as properties.
     * Attribute keys are camelized.
     * @param {Object} attrs
     * @returns {Object} a new model instance
     */
    create : function(attrs){
        return _.extend(Object.create(this), attrs);
    },
    /**
     * Extend "subclasses" with widget methods
     * @param {Function} constructor
     * @param {Object} extras - additional properties to add to prototype
     * @returns {Function}
     */
    extend: function(constructor, extras){
        constructor.prototype = Object.create(Widget.prototype);
        constructor.prototype.constructor = constructor;

        if (extras) {
            constructor.prototype = _.extend(constructor.prototype, extras);
        }

        return constructor;
    }
});

module.exports = Widget;