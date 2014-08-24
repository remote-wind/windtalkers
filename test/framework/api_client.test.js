describe("Framework/ApiClient", function(){

    var ApiClient = require('windtalkers/framework/api_client');
    var test = this;
    var xhr, requests;

    before(function () {
        this.client = new ApiClient();
        xhr = sinon.useFakeXMLHttpRequest();
        requests = [];
        xhr.onCreate = function (req) { requests.push(req); };
    });

    beforeEach(function(){
        requests = [];
    });

    after(function () {
        // Like before we must clean up when tampering with globals.
        xhr.restore();
    });

    describe(".getStations", function(){
        beforeEach(function(){
            this.mockjax = $.mockjax({
                url: '/stations.json'
            });
            this.promise = this.client.getStations();
        });

        it("should get data from /stations", function(){
            var requests = $.mockjax.mockedAjaxCalls();
            expect(requests[0].url).to.equal('/stations.json');
        });
    });

    /**
    describe(".getStation", function(){
        beforeEach(function(done){
            this.promiseMe(this.client.getStation(1), TestResponses.station.success, done);
        });
        it("should get data from /stations/:id", function(){
            expect(this.request.url).toEqual('/stations/1.json');
        });
        it("converts response to a station", function(){
            expect(this.result instanceof Station).toBeTruthy();
        });
    });

    describe(".getObservations", function(){
        beforeEach(function(done){
            this.promiseMe(this.client.getObservations(1), TestResponses.observations.success, done);
        });
        it("should get data from /stations/:id/observations", function(){
            expect(this.request.url).toEqual('/stations/1/observations.json');
        });
        it("converts response to observations", function(){
            expect(this.result.pop() instanceof Observation).toBeTruthy();
        });
    });
     **/

});