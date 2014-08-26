"use strict";

function Extendable(){}

// Extend the extendable. How far out is this?
_.extend(Extendable.prototype, {
    /**
     * Extend "subclasses" with controller methods
     * @param {Function} parent
     * @param {Function} child
     * @param {Object|Function} extras - additional properties to add to prototype.
     * @returns {Function}
     */
    extend: function(parent, child, extras){
        child.prototype = _.extend(child.prototype, Object.create(parent.prototype));
        child.prototype.constructor = child;
        if (extras) {
            if (_.isFunction(extras)) {
                extras = extras.call(child, child, parent);
            }
            child.prototype = _.extend(child.prototype, extras || {});
        }
        return child;
    }
});
module.exports = Extendable;