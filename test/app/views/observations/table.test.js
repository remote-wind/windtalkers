"use strict";

describe("App/Views/Observations/Table", function(){

    var TableView = require('windtalkers/app/views/observations/table');
    var Observation = require('windtalkers/app/models/observation');


    before(function(){
        this.sandbox = $('#sandbox');
        $('body').append(this.sandbox);
    });

    beforeEach(function(){

        this.sandbox.empty();

        this.observation = Observation({
           "cardinal" : "E",
           "created_at" : "2014-04-17T08:11:18Z",
           "direction" : 90.0,
           "id" : 45083,
           "max_wind_speed" : 5,
           "min_wind_speed" : 0.5,
           "speed" : 2,
           "station_id" : 4,
           "tstamp" : 1397722278
       });
       this.view = TableView({ per_page: 1 });
       this.rendered = this.view.render({
           station: { name: 'Test Station' },
           observations : [this.observation, this.observation]
       });
       this.sandbox.append(this.rendered);
    });

    after(function(){
        this.sandbox.remove();
    });


    describe("render", function(){
        it("displays the stations name", function(){
            expect(this.rendered.text()).to.contain('Test Station');
        });
        it("displays the wind speed", function(){
            expect(this.rendered.text()).to.contain('2 (0.5-5) ms');
        });
        it("displays the direction", function(){
            expect(this.rendered.text()).to.contain('E (90°)');
        });
    });

    describe("pagination", function(){
        it("adds pagination links", function(){
           expect(this.rendered.find('a.page').length).to.eq(2)
        });

        it("shows observations on page", function(){
            this.rendered.find('a.page:last').click();
            expect(this.rendered.find('.observation:last').hasClass('hidden')).to.beFalse
        });

        it("hides observations on not on page", function(){
            this.rendered.find('a.page:last').click();
            expect(this.rendered.find('.observation:first').hasClass('hidden')).to.beTrue
        });
    });
});