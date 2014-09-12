"use strict";

describe("App/Widgets/MapWidget", function(){
    var MapWidget = require('windtalkers/app/widgets/map_widget');

    beforeEach(function(){
        this.widget = MapWidget();
    });

    describe("startUp", function(){
        it("creates a controller", function(){
            expect(this.widget.startUp(this.sandbox).controller).to.exist
        })
    });
});