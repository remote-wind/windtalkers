"use strict";

describe("App/Controllers/ObservationController", function(){
    var ObservationsController = require('windtalkers/app/controllers/observations_controller');

    before(function(){
        this.node = $('<div>');
        this.controller = ObservationsController($('<div>'));
        $.mockjax($.mockjax.testResponses.observations.success);
        $.mockjax($.mockjax.testResponses.station.success);
    });

    after(function(){
        $.mockjaxClear();
    });

    it("creates a new instance without the new keyword.", function(){
        expect(ObservationsController()).to.be.an.instanceof(ObservationsController);
    });

    describe("index", function(){
        it("gets observations", function(){
            var spy = sinon.spy(this.controller.client, "getObservations");
            return this.controller.index(1).done(function(){
                expect(spy.calledWith(1)).to.be.true;
            });
        });
        it("gets station", function(){
            var spy = sinon.spy(this.controller.client, "getStation");
            return this.controller.index(1).done(function(){
                expect(spy.calledWith(1)).to.be.true;
            });
        });
        it("renders custom view if supplied", function(){
            var view = { render: function(){}};
            var spy = sinon.spy(view, 'render');
            return this.controller.index(1, view).done(function(){
                expect(spy.called).to.be.true;
            });
        });
        it("renders template into element", function(){
            var elem = this.node;
            return this.controller.index(1).done(function(state){
                expect(elem.children.length).to.be.above(0);
            });
        });
    });
});