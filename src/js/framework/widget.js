"use strict";

var Creator = require('windtalkers/framework/creator');

/**
 * @constructor
 */
function Widget(){}

module.exports = Creator.prototype.extend(Creator, Widget, {
    name: null,
    selector : null,
    startUp: function(){
        throw new Error("this.name "+"widget does not implement the .startUp method");
    },
    /**
     * Create wrapping element for creating widgets on the fly.
     * @returns {jQuery}
     */
    createElement : function(){
        return $('<div class="windtalkers-widget">')
            .addClass(this.selector.replace('.', ''));
    }
});