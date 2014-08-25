describe("App/Models/Station", function(){

    var Station = require('windtalkers/app/models/station');

    it("creates a new station instance without 'new'", function(){
        expect(Station()).to.be.an.instanceof(Station);
    });

    beforeEach(function(){
        this.station = Station({
            name: 'Test Station',
            url: 'Foo',
            offline: false,
            latest_observation : {
                observation : {
                    cardinal : "E",
                    id : 45083,
                    max_wind_speed : 3,
                    min_wind_speed : 1,
                    speed : 2,
                    direction: 90
                }
            }
        });
    });

    it("responds to name", function(){
        expect(this.station.name).to.equal('Test Station');
    });
    it("responds to url", function(){
        expect(this.station.url).to.equal('Foo');
    });

    describe(".latestObservation", function(){
        it("should convert the latest observation into an observation", function(){
            expect(this.station.latestObservation.id).to.equal(45083);
        });
    });

    describe(".toString", function(){
        it("includes the wind speed of an online station", function(){
            expect(this.station.toString()).to.equal('Test Station <br> 2&thinsp;(1-3) ms');
        });
        it("tells you that a station is offline", function(){
            this.station.offline = true;
            expect(this.station.toString()).to.equal('Test Station <br> Offline');
        });
    });

});