/**
 * This file is included before any tests are run. Use it to setup the test environment and load any common fixtures.
 */

global.$.mockjaxSettings.log = function(){}; // Mutes mockjax
global.$.mockjax.testResponses = require('./support/test_responses');
global.$.mockjaxSettings.responseTime = 1;

global.before(function(){
    this.sandbox = $('#sandbox');
});

global.beforeEach(function(){
    $.mockjax($.mockjax.testResponses.observations.success);
    $.mockjax($.mockjax.testResponses.station.success);
    $.mockjax($.mockjax.testResponses.stations.success);
});

global.afterEach(function(){
    this.sandbox.empty();
});