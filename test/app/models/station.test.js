describe("App/Models/Station", function(){

    var Station = require('windtalkers/app/models/station');

    it("creates a new station instance without 'new'", function(){
        expect(Station()).to.be.an.instanceof(Station);
    });

    beforeEach(function(){
        this.obj = Station({ name: 'Test Station' })
    });

});