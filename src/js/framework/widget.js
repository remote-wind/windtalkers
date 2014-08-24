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
    extend: function(constructor){
        constructor.prototype = Object.create(Widget.prototype);
        constructor.prototype.constructor = constructor;
    }
});

module.exports = Widget;