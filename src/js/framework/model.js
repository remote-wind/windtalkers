/**
 *
 * @constructor
 */
function Model(){
}

_.extend(Model.prototype, {
    /**
     * Creates a new instance of the model with attrs as properties.
     * Attribute keys are camelized.
     * @param {Object} attrs
     * @returns {Object} a new model instance
     */
    create : function(attrs){
        return _.extend(Object.create(this), attrs);
    },
    /**
     * Extend "subclasses" with model methods
     * @param {Function} constructor
     * @param {Object} extras - additional properties to add to prototype
     * @returns {Function}
     */
    extend: function(constructor, extras){
        constructor.prototype = Object.create(Model.prototype);
        constructor.prototype.constructor = constructor;
        if (extras) {
            constructor.prototype = _.extend(constructor.prototype, extras);
        }
        return constructor;
    }
});

/**
 *
 * @param constr
 */
module.exports = Model;