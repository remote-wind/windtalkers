"use strict";

// @todo tests are slow since
describe("App/Controllers/StationsController", function(){
    var StationsController = require('windtalkers/app/controllers/stations_controller');

    before(function(){
        this.node = $('<div>');
        this.controller = StationsController($('<div>'));
        $.mockjax($.mockjax.testResponses.stations.success);
    });

    after(function(){
        $.mockjaxClear();
    });

    describe("index", function(){
        it("gets observations", function(){
            var spy = sinon.spy(this.controller.client, "getStations");
            return this.controller.index().done(function(){
                expect(spy.called).to.be.true;
            });
        });
        it("renders custom view if supplied", function(){
            var view = { render: function(){}};
            var spy = sinon.spy(view, 'render');
            return this.controller.index(view).done(function(){
                expect(spy.called).to.be.true;
            });
        });
        it("renders template into element", function(){
            var elem = this.node;
            return this.controller.index().done(function(){
                expect(elem.children.length).to.be.above(0);
            });
        });
    });
});