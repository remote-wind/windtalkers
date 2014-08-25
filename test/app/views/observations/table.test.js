"use strict";

describe("App/Views/Observations/Table", function(){

    var TableView = require('windtalkers/app/views/observations/table');

    before(function(){
       this.view = TableView();
    });

    it("creates a new instance without new", function(){
        expect(this.view).to.be.an.instanceof(TableView);
    });
});