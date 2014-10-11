"use strict";
// Chai
global.expect = chai.expect;

// Mocking
global.sinon = require('sinon');
global.$.mockjaxSettings.log = function(){}; // Mute mockjax
global.$.mockjax.testResponses = require('./support/test_responses');
global.$.mockjaxSettings.responseTime = 1;

// Require test files here:

require('./framework/extendable.test');
require('./framework/creator.test');
require('./framework/container.test');
require('./framework/api_client.test');
require('./framework/model.test');
require('./framework/widget.test');
require('./framework/view.test');
require('./framework/controller.test');

require('./app/models/station.test');
require('./app/models/observation.test');

require('./app/controllers/observations_controller.test');
require('./app/controllers/modal_controller.test');
require('./app/controllers/stations_controller.test');

require('./app/views/observations/table.test');
require('./app/views/application/modal.test');
require('./app/views/stations/map.test');

require('./app/widgets/modal_widget.test');
require('./app/widgets/table_widget.test');
require('./app/widgets/map_widget.test');
require('./app/widgets/graph_widget.test');

$(function(){
    if (window.mochaPhantomJS) { mochaPhantomJS.run(); }
    else { mocha.run(); }
});

before(function(){
    this.sandbox = $('#sandbox');
    $.mockjax($.mockjax.testResponses.observations.success);
    $.mockjax($.mockjax.testResponses.station.success);
    $.mockjax($.mockjax.testResponses.stations.success);
});

afterEach(function(){
    this.sandbox.empty();
});