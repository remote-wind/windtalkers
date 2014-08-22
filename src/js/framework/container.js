'use strict';

var _ = require('underscore');
var $ = require('jquery');
/**
 * A simple service container that contains the registered widgets and handles startup and teardown.
 * @param {Object} options
 * @constructor
 */
function Container(options){
    this.options = _.defaults(options || {}, {
        /**
         *  @option context
         *  Can be used to limit the scope to search for widgets in.
         *  Also can be used to stub in a fixture.
         */
        context : $("body"),
        baseUrl: 'http://www.blast.nu'
    });
}

Container.prototype = _.extend(Container.prototype, {
    /**
     * Takes several widget manifests and combines into an object
     * Takes an unlimited number of arguments as members of the object
     *
     * @param {Object} splat
     * @returns {Object} the registered widgets
     */
    register : function(splat){
        return _.object(_.map(Array.prototype.slice.call(arguments),
            function(manifest){
                manifest["instances"] = manifest["instances"] || [];
                return [manifest.name, manifest];
            }
        ));
    },
    /**
     * Loops through the widget manifests and finds matching DOM elements and creates a widget instance for each.
     * The `.startUp` method is then called for each widget instance.
     * @param {Object} widgets
     * @param {Object} context
     * @returns {Object}
     */
    startAll : function(widgets, context){
        var container = this;
        context = context || this.options.context;
        return _.each(widgets, function(widget){
            var nodes = context.find(widget.selector);
            // Loop through matching DOM elements
            widgets[widget.name].instances = _.map(nodes, function(node){
                var instance = new widget.Constructor(container);
                instance.startUp(node);
                return instance;
            });
            return widget;
        });
    },
    /**
     * Runs after `.startAll` and calls the update method if available for each widget
     * @param {Object} widgets
     * @returns {Object} the updated widgets
     */
    updateAll : function(widgets) {
        var container = this;
        return _.each(widgets, function (widget) {
            widget.instances = _.each(widget.instances, function (instance) {
                if (typeof instance.update == "function") {
                    instance.update.call(instance, container);
                }
                return instance;
            });
            return widget;
        });
    }
});

/**
 * Create a new service container
 * @see Container for params.
 */
exports.create = (function() {
    return function(args) {
        return new Container(args);
    }
})();

exports.Constructor = Container;