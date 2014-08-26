describe("Framework/View", function(){

    var View = require('windtalkers/framework/view');

    /**
     * This is just a sample constructor of a widget.
     * @constructor
     */
    function FooView(){}
    View.prototype.extend(View, FooView);

    it("is extendable", function(){
        expect(View.prototype.extend).to.exist;
    });
    it("is a creator", function(){
        expect(View.prototype.create).to.exist;
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