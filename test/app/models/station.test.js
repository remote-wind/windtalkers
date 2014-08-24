describe("App/Models/Station", function(){

    var Station = require('windtalkers/app/models/station');

    it("creates a new station instance without 'new'", function(){
        expect(Station() instanceof Station).to.be.true;
    });

    beforeEach(function(){
        this.obj = Station({ name: 'Test Station' })
    });

});