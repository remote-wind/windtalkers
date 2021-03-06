"use strict";

describe('Framework/Container', function(){
    var container = require('windtalkers/framework/container');
    var Widget = require('windtalkers/framework/widget');

    var $ = require('jquery');

    before(function(){
      this.MockWidget = function(){}
      Widget.prototype.extend(Widget, this.MockWidget, {
          name: 'MockWidget',
          selector: '.mock-widget',
          startUp: function(){ this.started = true; }
      });
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
            var registered = this.ctr.register([this.MockWidget]);
            expect(registered.MockWidget).to.equal(this.MockWidget);
        });
    });

    describe("starting widgets", function(){
        beforeEach(function() {
            this.ctr = container.create();
            this.started = this.ctr.startAll(
                this.ctr.register([this.MockWidget]),
                $('<div id="sandbox"><div class="windtalkers-widget mock-widget"></div></div>')
            );
        });

        it("creates an new instance", function(){
            expect(this.started.MockWidget.instances.length).to.equal(1);
        });

        it("starts up widgets", function(){
            expect(this.started.MockWidget.instances[0].started).to.be.true;
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