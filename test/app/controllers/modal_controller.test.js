"use strict";

describe('App/Controllers/ModalController', function(){

    var elem, ctrl, $elem, xid, view;
    var ModalController = require('windtalkers/app/controllers/modal_controller');

    // Warning: this spec has alot of nasty async expectations.
    beforeEach(function(){
        xid = _.uniqueId();
        $elem = $('<div id="modal-test-fixture">');
        ctrl = ModalController($elem);
        elem = ctrl.element;
        view = ctrl.view;
    });


    it("attaches element to DOM", function(){
        return expect(document.getElementById("modal-test-fixture")).to.exist;
    });

    describe("show", function(){
        beforeEach(function(){
           this.action =  ctrl.show("<p>Hello World</p>");
        });

        xit("AAARRG! shows the overlay", function(){
            return this.action.done(function(overlay){
                expect(overlay.is(':visible')).to.be.true;
            });
        });
        xit("AAARRG! shows the modal window", function(){
            return this.action.done(function(){
                expect(view.window.is(':visible')).to.be.true;
            });
        });
        it("inserts the contents into the window", function(){
            return this.action.done(function(){
                expect(view.window.find("p").text()).to.equal("Hello World");
            });
        });
    });

    describe("close", function(){

        beforeEach(function(done){
            return ctrl.show("<p>Hello World</p>").done(function(){
                done();
            });
        });

        it("closes when user clicks overlay", function(){
            var close;
            ctrl.close = function(){};
            close = sinon.spy(ctrl, 'close');
            view.overlay.click();
            expect(close.called).to.be.true;
        });
        it("closes when user presses escape", function(){
            var e = jQuery.Event("keyup");
            var close = sinon.spy(ctrl, 'close');
            e.keyCode = 27; // # Some key code value
            $(document).trigger(e);
            expect(close.called).to.be.true;
        });
        it("closes when user presses close button", function(){
            var close = sinon.spy(ctrl, 'close');
            view.window.find('button.close').click();
            expect(close.called).to.be.true;
        });
        it("hides the overlay", function(){
            return ctrl.close(elem).done(function(){
                expect(view.overlay.is(":visible")).to.be.false;
            });
        });
        it("empties the window", function(){
            var contents = view.window.find('.modal-contents');
            expect(contents.text()).to.equal("Hello World");
            return ctrl.close().done(function(){
                return expect(contents.text()).not.to.equal("Hello World");
            });
        });
    });
});