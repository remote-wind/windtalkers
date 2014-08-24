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

    describe("render", function(){
        beforeEach(function(){
            this.view = FooView.prototype.create( { foo: 'bar' } );
            this.view.template = _.template(
                '<p><%= this.foo %></p>'
            );
        });
        it("expands variables in template", function(){
            expect(this.view.render({ foo: 'bar'}).text()).to.equal('bar');
        });
        it("uses default translations if available", function(){
            this.view.template = _.template(
                '<p><%= this.trans.dog %></p>'
            );
            this.view.defaultTranslations = {
                dog : 'canem'
            };
            expect(this.view.render().text()).to.equal('canem');
        });
    });

});