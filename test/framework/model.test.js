describe("Framework/Model", function(){

    var Model = require('windtalkers/framework/model');

    it("is extendable", function(){
        expect(Model.prototype.extend).to.exist;
    });
    it("is a creator", function(){
        expect(Model.prototype.create).to.exist;
    });
});