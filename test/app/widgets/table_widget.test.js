"use strict";

describe("App/Widgets/TableWidget", function(){
    var TableWidget = require('windtalkers/app/widgets/table_widget');
    var ObservationsController = require("windtalkers/app/controllers/observations_controller");

    beforeEach(function(){
        this.widget = TableWidget();
    });

    describe("startUp", function(){
        it("creates a controller", function(){
            expect(this.widget.startUp(this.sandbox).controller).to.be.an.instanceof(ObservationsController);
        })
    });
});