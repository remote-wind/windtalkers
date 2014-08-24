"use strict";

/**
 * Used to create prototype for views.
 * @constructor not intended for direct use.
 */
function View(){}

_.extend(View.prototype, {
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
        constructor.prototype = Object.create(View.prototype);
        constructor.prototype.constructor = constructor;
    },
    /**
     * Expands the .template with view_data assigned as the templates context
     *  This means that any view data can be accessed with `this` from the template
     * @param view_data
     * @param translations
     * @returns {jQuery}
     */
    render : function(view_data, translations){
        view_data = view_data || {};
        translations =  _.defaults(translations || {}, this.defaultTranslations || {});
        var expanded = this.template.call(
            _.extend(
                view_data, {
                    trans: _.defaults(translations || {}, this.defaultTranslations || {})
                }
            ),
            {
                // shortcut to translations
                t : translations
            }
        );
        return $(expanded);
    }
});

module.exports = View;