"use strict";

describe("App/Views/Stations/Map", function(){

    var MapView = require('windtalkers/app/views/stations/map');
    var GoogleMapsLoader = require('google-maps');
    var Station = require('windtalkers/app/models/station');

    before(function(done){
        GoogleMapsLoader.load(function(google){
            global.google = google;
            done();
        });
    });

    beforeEach(function(){
        this.view = MapView(google);
    });

    it("creates a new instance without new", function(){
        expect(this.view).to.be.an.instanceof(MapView);
    });

    describe("createMap", function(){

        beforeEach(function(){
            this.map = this.view.createMap(document.createElement('div'), {
                zoom: 3
            });
        });

        it("creates a map", function(){
            return expect(this.map.getMapTypeId).to.exist;
        });
        it("passes mapOptions", function(){
            return expect(this.map.getZoom()).to.equal(3);
        });
    });

    describe("updateMap", function(){
        beforeEach(function(){
            this.data = {
                map: this.view.createMap(document.createElement('div'), {}),
                stations: [
                    new Station({
                        name: 'Test Station',
                        latitude: 66.6,
                        longitude: 60.0,
                        offline: false,
                        latest_observation: {
                            observation: {
                                max_wind_speed : 3,
                                min_wind_speed : 1,
                                speed : 2,
                                direction: 90
                            }
                        }
                    }),
                    new Station({
                        name: "The Dead Station",
                        offline: true,
                        latitude: -66.6,
                        longitude: -60.0
                    })
                ]
            };
            this.updated = this.view.updateMap(this.data);
            this.marker = this.updated.markers[0];
        });

        it("creates a marker for each station", function(){
            expect(this.updated.markers.length).to.equal(2);
        });

        it("creates the correct label for an online station", function(){
            expect(this.marker.label.text).to.equal('Test Station <br> 2&thinsp;(1-3) ms');
        });

        it("creates the correct label for an offline station", function(){
            this.marker = this.updated.markers[1];
            expect(this.marker.label.text).to.equal('The Dead Station <br> Offline');
        });

        it("rotates the arrow icon to point away from the wind direction (with the wind)", function(){
            expect(this.marker.icon.rotation).to.equal(90 + 180);
        });

        it("places marker at the correct coordinates", function(){
            expect(this.marker.getPosition().lat()).to.equal(66.6);
            expect(this.marker.getPosition().lng()).to.equal(60);
        });

        it("removes existing markers", function(){
            var setMap = sinon.spy(this.marker, 'setMap');
            this.view.updateMap(this.data);
            return expect(setMap.calledWith(null)).to.be.true;
        });

        it("assigns a click callback to marker", function(){
            var callback =  sinon.spy(function(){});
            var reupdated = this.view.updateMap(this.data, callback);
            google.maps.event.trigger( reupdated.markers[0], 'click' );
            expect(callback.called).to.be.true;
        });
    });
});