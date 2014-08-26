describe("Framework/Widget", function(){

    var Widget = require('windtalkers/framework/widget');

    /**
     * This is just a sample constructor of a widget.
     * @constructor
     */
    function FooWidget(){}

    beforeEach(function(){
        Widget.prototype.extend(Widget, FooWidget);
    });

    describe("extend", function(){
        it("extends functions prototype", function(){
            expect(FooWidget.prototype.create).to.exist;
        });
        it("has the proper constructor", function(){
            var f = new FooWidget();
            expect(f instanceof FooWidget).to.be.true;
        });
    });
    describe("create", function(){
        beforeEach(function(){
            this.instance = FooWidget.prototype.create( { foo: 'bar' } );
        });
        it("assigns attributes to instance", function(){
            expect(this.instance.foo).to.equal('bar');
        });
        it("has the correct constuctor", function(){
            expect(this.instance.constructor).to.equal(FooWidget);
        });
    });
});