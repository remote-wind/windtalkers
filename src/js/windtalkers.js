"use strict";

require('windtalkers/polyfill');

var Container = require('windtalkers/framework/container');

function Windtalkers(options){
    var container = Container.create(options);
    this.init = function(){
        var widgets = {};
        widgets.registered = container.register(
            // ..
        );
        widgets.started = container.startAll(widgets.registered);
        return widgets;
    };
}

module.exports = Windtalkers;
