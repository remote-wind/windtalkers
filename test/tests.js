// Libraries
global.$ = global.jQuery = require('jquery');
global._ = require('underscore');

// Chai
var chai = global.chai = require('chai');
global.expect = require('chai').expect;
chai.use(require("chai-as-promised"));

// Mocking
var sinon = global.sinon = require('sinon');
var mockjax = require('jquery-mockjax/jquery.mockjax');

global.$.mockjaxSettings.log = function(){}; // Mute mockjax


// Sinon refuses to load FakeXMLHttpRequest and FakeServer on node.js so we load them manually:
if (!sinon.useFakeXMLHttpRequest) require('sinon/lib/sinon/util/fake_xml_http_request');

// Require test files here:
require('./framework/container.test');
require('./framework/api_client.test');
require('./framework/model.test');
require('./app/models/station.test');

$(function() {
    if (window.mochaPhantomJS) { mochaPhantomJS.run(); }
    else { mocha.run(); }
});