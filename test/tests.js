global.chai = require('chai');
global.expect = require('chai').expect;
global.sinon = require('sinon');

// Sinon refuses to load FakeXMLHttpRequest and FakeServer on node.js so we load them manually:
if (!sinon.useFakeXMLHttpRequest) require('sinon/lib/sinon/util/fake_xml_http_request');
if (!sinon.fakeServer) require('sinon/lib/sinon/util/fake_server');

var $ = global.jQuery || require('jquery');

// Require test files here:
require('./framework/container.test.js');
require('./framework/api_client.test.js');

$(function() {
    if (window.mochaPhantomJS) { mochaPhantomJS.run(); }
    else { mocha.run(); }
});