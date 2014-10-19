"use strict";

describe("App/Widgets/GraphWidget", function(){
    var GraphWidget = require('windtalkers/app/widgets/graph_widget');

    beforeEach(function(){
        this.widget = GraphWidget();
    });

    it("has the correct name", function(){
        expect(GraphWidget.prototype.name).to.equal('GraphWidget');
    });

    it("has the correct selector", function(){
        var html = $("<div class='graph-widget'></div><div class='foo-widget'></div>");
        expect(html.filter(GraphWidget.prototype.selector).length).to.eq(1);
    });

    describe("startUp", function(){

        beforeEach(function(){
            this.promise = this.widget.startUp(this.sandbox).promise;
        });

        it("creates a graph", function(){
            return this.promise.done(function(state){
                expect(state.graph).to.have.property('render'); // quacks like a duck.
            });
        });

        it("annotates graph", function(){
            return this.promise.done(function(state){
                expect($(state.annotations).children('.arrow').length).to.equal(state.observations.length)
            });
        });
    });
});