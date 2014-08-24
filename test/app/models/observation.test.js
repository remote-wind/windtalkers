describe("App/Models/Observation", function(){

    var Observation = require('windtalkers/app/models/observation');

    it("creates a new observation instance without 'new'", function(){
        expect(Observation() instanceof Observation).to.be.true;
    });

});