"use strict";

describe("App/Models/Observation", function(){

    var Observation = require('windtalkers/app/models/observation');

    beforeEach(function(){
        this.model = Observation({
            "speed": 5.2,
            "max_wind_speed": 6,
            "min_wind_speed": 4,
            "created_at": "2014-06-03T01:14:17Z",
            "tstamp": 1401758057,
            "direction": 39,
            "cardinal": "NE"
        });
    });

    it("creates a new observation instance without 'new'", function(){
        expect(Observation()).to.be.an.instanceof(Observation);
    });

    describe(".windSpeed", function(){
        it("adds together speed(min-max)", function(){
            expect(this.model.windSpeed()).to.equal("5.2&thinsp;(4-6) ms");
        });
    });
    describe(".dateTime", function(){
        it("creates a locale sensitive date date_time string", function(){
            expect(this.model.dateTime(['en'])).to.equal(
                new Date(1401758057 * 1000).toLocaleString(['en'])
            );
            expect(this.model.dateTime(['sv'])).to.equal(
                new Date(1401758057 * 1000).toLocaleString(['sv'])
            );
        });
    });
    describe(".degreesAndCardinal", function(){
        it("formats cardinal and degrees", function(){
            expect(this.model.degreesAndCardinal()).to.equal("NE&thinsp;(39°)");
        });
    });
});