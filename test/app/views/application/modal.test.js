"use strict";

describe('App/Views/Application/Modal', function(){

    var ModalView = require('windtalkers/app/views/application/modal');

    beforeEach(function(){
        this.view = ModalView();
    });
    describe('.render', function(){
        beforeEach(function(){
            this.rendered = this.view.render();
            this.window = this.rendered.filter('.modal-window');
        });
        it("creates an overlay", function(){
            expect(this.rendered.filter('.modal-overlay').length).to.equal(1);
        });
        it("creates a window", function(){
            expect(this.window.length).to.equal(1);
        });
        it("creates a close button", function(){
            expect(this.window.find('button.close').length).to.equal(1);
        });
        it("adds correct default text to close button", function(){
            expect(this.window.find('button:contains("Close")').length).to.equal(1);
        });

        it("creates shortcuts", function(){
            expect( this.view.window ).to.exist;
            expect( this.view.overlay ).to.exist;
        });
    });
});