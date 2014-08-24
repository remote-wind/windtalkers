describe("Framework/View", function(){

    var View = require('windtalkers/framework/view');

    /**
     * This is just a sample constructor of a widget.
     * @constructor
     */
    function FooView(){}

    beforeEach(function(){
        View.prototype.extend(FooView);
    });

    describe("extend", function(){
        it("extends functions prototype", function(){
            expect(FooView.prototype.create).to.exist;
        });
        it("has the proper constructor", function(){
            var f = new FooView();
            expect(f instanceof FooView).to.be.true;
        });
    });
    describe("create", function(){
        beforeEach(function(){
            this.instance = FooView.prototype.create( { foo: 'bar' } );
        });
        it("assigns attributes to instance", function(){
            expect(this.instance.foo).to.equal('bar');
        });
        it("has the correct constuctor", function(){
            expect(this.instance.constructor).to.equal(FooView);
        });
    });
});