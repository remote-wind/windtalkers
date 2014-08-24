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
    extend: function(constructor){
        constructor.prototype = Object.create(Model.prototype);
        constructor.prototype.constructor = constructor;
    }
});

/**
 *
 * @param constr
 */
module.exports = Model;