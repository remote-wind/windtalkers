"use strict";

describe("Framework/Creator", function(){

    var Creator = require('windtalkers/framework/creator');

    function Monster(attr){
        return Monster.prototype.create(attr);
    }
    Creator.prototype.extend(Creator, Monster);

    it("creates instances without the 'new' keyword", function(){
        expect(Monster() instanceof Monster);
    });

    it("applies attributes to instance", function(){
        expect(Monster({ name: 'Kraken' }).name).to.equal('Kraken');
    });

    it("calls attributes if it is a function", function(){
        var cb = sinon.spy();
        var monster = Monster(cb);
        return expect(cb.called).to.be.true;
    });

    it("assigns return value from attr function", function(){
        var fn = function(i){
            this.eggs = 'spam';
            i.ham = 'spork';
            return {
                foo: 'bar'
            }
        };

        expect(Monster(fn).foo).to.equal('bar');
        expect(Monster(fn).eggs).to.equal('spam');
        expect(Monster(fn).ham).to.equal('spork');
    });
});