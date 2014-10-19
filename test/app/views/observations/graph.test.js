"use strict";

var GraphView = require('windtalkers/app/views/observations/graph');
var Observation = require('windtalkers/app/models/observation');

describe("App/Views/Observations/Graph", function(){
    beforeEach(function(){ this.view = GraphView(); });

    describe("render", function(){
        beforeEach(function(){
            this.rendered = this.view.render();
        });

        it("has a holder for x-axis", function(){
            expect(this.rendered.find('.x-axis').length).to.be.above(0);
        });
    });

    describe('.stack', function(){
        beforeEach(function(){
            this.stack = this.view.stack([
                new Observation({
                    speed: 4,
                    min_wind_speed: 1,
                    max_wind_speed: 5,
                    tstamp: 1404063236 // 2014-06-29 19:33:56 +0200
                }),
                new Observation({
                    speed: 3,
                    min_wind_speed: 2,
                    max_wind_speed: 6,
                    tstamp: 1404063603 // 2014-06-29 19:40:03 +0200
                })
            ]);
        });

        it("includes min", function(){
            expect(this.stack[0].data[0].y).to.equal(1);
            expect(this.stack[0].data[0].x).to.equal(1404063236);
            expect(this.stack[0].data[1].y).to.equal(2);
            expect(this.stack[0].data[1].x).to.equal(1404063603);
        });

        it("includes average speed", function(){
            expect(this.stack[1].data[0].y).to.equal(4);
            expect(this.stack[1].data[0].x).to.equal(1404063236);
            expect(this.stack[1].data[1].y).to.equal(3);
            expect(this.stack[1].data[1].x).to.equal(1404063603);
        });

        it("includes max speed", function(){
            expect(this.stack[2].data[0].y).to.equal(5);
            expect(this.stack[2].data[0].x).to.equal(1404063236);
            expect(this.stack[2].data[1].y).to.equal(6);
            expect(this.stack[2].data[1].x).to.equal(1404063603);
        });
    });

    describe("createGraph", function(){
        beforeEach(function(){
            this.rickshaw = this.view.createGraph(
                this.view.stack([
                    {
                        speed: 4,
                        min: 1,
                        max: 5,
                        tstamp: 1404063236 // 2014-06-29 19:33:56 +0200
                    }
                ]),
                this.view.render({}),
                {
                    element: $('<div></div>')[0]
                });
        });
        it("creates a Rickshaw graph", function(){
            expect(typeof this.rickshaw.render).to.equal('function');
            expect(typeof this.rickshaw.update).to.equal('function');
        });
        it("creates a custom Y-Axis", function(){
            return expect(this.rickshaw.axes.y).to.exist;
        });
        it("creates a customx X-Axis", function(){
            return expect(this.rickshaw.axes.x).to.exist;
        });
        it("creates direction annotations", function(){
            return expect(this.rickshaw.annotator).to.exist;
        });
        it("sets min if maximum value in stack is under threshold", function(){
            expect(this.rickshaw.min).to.equal(0);
        });
        it("sets max if maximum value in stack is under threshold", function(){
            expect(this.rickshaw.max).to.equal(10);
        });
    });
});