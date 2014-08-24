describe("framework/station", function(){

    var Station = require('windtalkers/app/models/station');

    beforeEach(function(){
        this.obj = Station({ name: 'Test Station' })
    });

    it("has a create method", function(){
        expect(this.obj.name).to.equal('Test Station');
    });
});