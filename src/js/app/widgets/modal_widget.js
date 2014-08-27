"use strict";

var Widget = require('windtalkers/framework/widget');
var ModalController =  require('windtalkers/app/controllers/modal_controller');

/**
 * Displays content in a "popup" window.
 * @constructor
 */
function ModalWidget(){
    return ModalWidget.prototype.create(function(instance){ /** properties **/ });
}

module.exports = Widget.prototype.extend(Widget, ModalWidget, {
    name: "ModalWidget",
    selector: '.modal-widget',
    /**
     * Create the wrapping element
     * @returns {jQuery}
     */
    createElement : function(){
        return $('<div class="windtalkers-widget">')
            .addClass(this.selector.replace('.', ''));
    },
    /**
     * @param {jQuery} $elem
     * @returns {ModalWidget}
     */
    startUp: function($elem){
        return ModalWidget.prototype.create({
            controller : ModalController($elem)
        });
    }
});