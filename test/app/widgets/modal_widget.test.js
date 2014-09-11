"use strict";

describe("App/Widgets/ModalWidget", function(){
    var ModalWidget = require('windtalkers/app/widgets/modal_widget');
    var ModalController = require("windtalkers/app/controllers/modal_controller");

    beforeEach(function(){
        this.widget = ModalWidget();
    });

    describe("startUp", function(){
        it("creates a controller", function(){
            expect(this.widget.startUp($('<div>')).controller).to.be.an.instanceof(ModalController);
        })
    });
});