require(['app/models/station', 'app/models/observation'], function(Station, Observation){
    describe("App/Models/Station", function(){
        beforeEach(function(){
            this.station = new Station({
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
            expect(this.station.name).toEqual('Test Station');
        });
        it("responds to url", function(){
            expect(this.station.url).toEqual('Foo');
        });

        describe(".latestObservation", function(){
            it("should convert the latest observation into an observation", function(){
                expect(this.station.latestObservation.id).toEqual(45083);
            });
        });

        describe(".toString", function(){
            it("includes the wind speed of an online station", function(){
                expect(this.station.toString()).toEqual('Test Station <br> 2&thinsp;(1-3) ms');
            });
            it("tells you that a station is offline", function(){
                this.station.offline = true;
                expect(this.station.toString()).toEqual('Test Station <br> Offline');
            });
        });
    });
});