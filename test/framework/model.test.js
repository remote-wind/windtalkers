describe("Framework/Model", function(){

    var Model = require('windtalkers/framework/model');

    /**
     * This is just a sample constructor of a model.
     * @constructor
     */
    function Builder(){

    }

    beforeEach(function(){
        Model.prototype.extend(Builder);
    });


    describe("extend", function(){
        it("extends functions prototype", function(){
            expect(Builder.prototype.create).to.exist;
        });

        it("has the proper constructor", function(){
            var f = new Builder();
            expect(f instanceof Builder).to.be.true;
        });
    });

    describe("create", function(){
        beforeEach(function(){
            this.instance = Builder.prototype.create( { foo: 'bar' } );
        });

        it("assigns attributes to instance", function(){
            expect(this.instance.foo).to.equal('bar');
        });

        it("has the correct constuctor", function(){
            expect(this.instance.constructor).to.equal(Builder);
        });
    });
});