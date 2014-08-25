// Libraries
global.$ = global.jQuery = require('jquery');
global._ = require('underscore');

// Chai
var chai = global.chai = require('chai');
var expect = global.expect = require('chai').expect;

// Mocking
var sinon = global.sinon = require('sinon');
var mockjax = require('jquery-mockjax/jquery.mockjax');
global.$.mockjaxSettings.log = function(){}; // Mute mockjax
global.$.mockjax.testResponses = require('./support/test_responses');

// Require test files here:
require('./framework/container.test');
require('./framework/api_client.test');
require('./framework/model.test');
require('./framework/widget.test');
require('./framework/view.test');

require('./app/models/station.test');
require('./app/models/observation.test');
require('./app/controllers/observations_controller.test');

$(function() {
    if (window.mochaPhantomJS) { mochaPhantomJS.run(); }
    else { mocha.run(); }
});