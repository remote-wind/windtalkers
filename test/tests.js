// Libraries
global.$ = global.jQuery = require('jquery');
global._ = require('underscore');

// Chai
global.chai = require('chai');
global.expect = require('chai').expect;

// Mocking
global.sinon = require('sinon');
require('jquery-mockjax/jquery.mockjax');
global.$.mockjaxSettings.log = function(){}; // Mute mockjax
global.$.mockjax.testResponses = require('./support/test_responses');

// Require test files here:

require('./framework/extendable.test');
require('./framework/creator.test');
require('./framework/container.test');
require('./framework/api_client.test');
require('./framework/model.test');
require('./framework/widget.test');
require('./framework/view.test');
require('./framework/controller.test');
////
require('./app/models/station.test');
require('./app/models/observation.test');
require('./app/controllers/observations_controller.test');
require('./app/views/observations/table.test');
require('./app/controllers/modal_controller.test');
require('./app/views/application/modal.test');

$(function(){
    if (window.mochaPhantomJS) { mochaPhantomJS.run(); }
    else { mocha.run(); }
});