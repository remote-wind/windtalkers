"use strict";

describe("Framework/ApiClient", function(){

    var ApiClient = require('windtalkers/framework/api_client');
    var Station = require('windtalkers/app/models/station');
    var Observation = require('windtalkers/app/models/observation');

    before(function () {
        this.client = new ApiClient();
        $.mockjaxSettings.responseTime = 0;
    });

    afterEach(function(){
        $.mockjaxClear();
    });

    describe(".getStations", function(){
        beforeEach(function(){
            $.mockjax({
                url: '/stations.json',
                responseText: [
                    {
                        id: 666,
                        name: 'Test Station'
                    },
                    {
                        id: 999,
                        name: 'Test Station 2'
                    }
                ]
            });
            this.promise = this.client.getStations();
        });
        it("should get data from the proper url", function(){
            var requests = $.mockjax.mockedAjaxCalls();
            expect(requests[0].url).to.equal('/stations.json');
        });
        it("transforms data to stations", function(){
            return this.promise.done(function(result){
                expect(result[0]).to.be.an.instanceof(Station);
            });
        });
    });

    describe(".getStation", function(){
        beforeEach(function(){
            $.mockjax({
                url: '/stations/*.json',
                responseText: {
                    id: 999,
                    name: 'Test Station'
                }
            });
            this.promise = this.client.getStation(1);
        });
        it("should get data from the proper url", function(){
            var requests = $.mockjax.mockedAjaxCalls();
            expect(requests[0].url).to.equal('/stations/1.json');
        });
        it("transforms data to a station", function(){
            return this.promise.done(function(result){
                expect(result).to.be.an.instanceof(Station);
            });
        });
    });

    describe(".getObservations", function(){
        beforeEach(function(){
            $.mockjax({
                url: '/stations/*/observations.json',
                responseText: [
                    { id: 999 },
                    { id: 666 }
                ]
            });
            this.promise = this.client.getObservations(1);
        });
        it("should get data from the proper url", function(){
            var requests = $.mockjax.mockedAjaxCalls();
            expect(requests[0].url).to.equal('/stations/1/observations.json');
        });
        it("transforms data to a observations", function(){
            return this.promise.done(function(result){
                expect(result[0]).to.be.an.instanceof(Observation);
            });
        });
    });
});