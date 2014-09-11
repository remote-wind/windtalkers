"use strict";

describe("App/Widgets/TableWidget", function(){
    var TableWidget = require('windtalkers/app/widgets/table_widget');
    var ObservationsController = require("windtalkers/app/controllers/observations_controller");

    before(function(){
        this.sandbox = $('<div id="sandbox" data-station-id="gsc">');
    });

    beforeEach(function(){
        this.sandbox.empty();
        this.widget = TableWidget();
    });

    after(function(){
        this.sandbox.remove();
    });

    describe("startUp", function(){
        it("creates a controller", function(){
            expect(this.widget.startUp(this.sandbox).controller).to.be.an.instanceof(ObservationsController);
        })
    });
});