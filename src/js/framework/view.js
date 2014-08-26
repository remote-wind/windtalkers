"use strict";

var Creator = require('windtalkers/framework/creator');

/**
 * Used to create prototype for views.
 * @constructor not intended for direct use.
 */
function View(){}

module.exports = Creator.prototype.extend(Creator, View, {
    /**
     * Expands the .template with view_data assigned as the templates context
     *  This means that any view data can be accessed with `this` from the template
     * @param view_data
     * @param translations
     * @returns {jQuery}
     */
    render : function(view_data, translations){
        var rendered;

        view_data = view_data || {};
        translations =  _.defaults(translations || {}, this.defaultTranslations || {});
        rendered = $(this.template.call(
            _.extend(
                view_data, {
                    trans: _.defaults(translations || {}, this.defaultTranslations || {})
                }
            ),
            {
                // shortcut to translations
                t : translations
            }
        ));

        if (_.isFunction(this['afterRender'])) {
            this.afterRender(rendered);
        }

        return rendered;
    }
});