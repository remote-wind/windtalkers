"use strict";

describe("Framework/Extendable", function(){

    var Extendable = require("windtalkers/framework/extendable");

    var TestObject;

    beforeEach(function(){
        TestObject = function(){};
    });

    it("extends the prototype of child function", function(){
        function Foo(){}
        Foo.prototype.bar = 'baz';
        Extendable.prototype.extend(Foo, TestObject);
        expect(TestObject.prototype.bar).to.equal('baz');
    });

    it("extends function with extras", function(){
        function A(){}
        Extendable.prototype.extend(Extendable, TestObject);
        TestObject.prototype.extend(TestObject, A, { foo: 'bar' });
        expect(A.prototype.foo).to.equal('bar');
    });


    it("executes extras function", function(){
        var fn = sinon.spy();
        Extendable.prototype.extend(Extendable, TestObject, fn);
        expect(fn.called).to.be.true;
    });

    it("adds properties returned from extras function", function(){
        function B(){};

        Extendable.prototype.extend(Extendable, B, function(){
            return { foo: 'bar' }
        });
        expect(B.prototype.foo).to.equal('bar');
    });


});