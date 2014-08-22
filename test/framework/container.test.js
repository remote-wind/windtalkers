require('../test_helper');

describe('Framework/Container', function(){
    var container = require('windtalkers/framework/container');
    var $ = require('jquery');

    before(function(){
        this.MockWidget = function(){
            this.started = false;
            this.startUp = function(){ this.started = true; };
            this.update = function(){};
        };
    });

    describe('create', function(){
        it("creates a new container", function(){
            var ctr = container.create();
            expect(typeof ctr).to.equal('object');
        });
        it("passes args to constructor", function(){
            var ctr = container.create({ foo: 'bar' });
            expect(ctr.options.foo).to.equal('bar');
        });
    });

    describe('registering widgets', function(){
        beforeEach(function(){
            this.ctr = container.create({ foo: 'bar' });
        });
        it("returns a object containing widgets", function(){
            var exp = { name: 'foo'};
            var registered = this.ctr.register(exp, { name: 'bar' });
            expect(registered.foo).to.equal(exp);
        });
    });

    describe("starting widgets", function(){
        beforeEach(function() {
            this.ctr = container.create();
            this.started = this.ctr.startAll(this.ctr.register({
                selector: '.foo-widget',
                name: 'foo',
                Constructor: this.MockWidget
            }), $('<div id="sandbox"><div class="windtalkers-widget foo-widget"></div></div>'));
        });

        it("creates an new instance", function(){
            expect(this.started.foo.instances.length).to.equal(1);
        });

        it("starts up widgets", function(){
            expect(this.started.foo.instances[0].started).to.be.true;
        });
    });

    describe("updating widgets", function(){
        it("calls update on each widget instance if available", function(){
            var instance, spy;
            instance = {
                update: function(){}
            };
            spy = sinon.spy(instance, 'update');
            container.create().updateAll({
                fooWidget : {
                    instances: [instance, {}]
                }
            });
            expect(spy.called).to.be.true;
        });
    });
});