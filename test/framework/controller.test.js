"use strict";

describe("Framework/Controller", function(){
    var Controller = require('windtalkers/framework/controller');
    it("is extendable", function(){
        expect(Controller.prototype.extend).to.exist;
    });
    it("is a creator", function(){
        expect(Controller.prototype.create).to.exist;
    });
});