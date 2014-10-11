"use strict";

describe("App/Widgets/GraphWidget", function(){
    var GraphWidget = require('windtalkers/app/widgets/graph_widget');

    beforeEach(function(){
        this.widget = GraphWidget();
    });

    describe("startUp", function(){
        it("creates a controller", function(){
            expect(this.widget.startUp(this.sandbox).controller).to.exist;
        })
    });
});