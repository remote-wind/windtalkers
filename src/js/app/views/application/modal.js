"use strict";

var View = require('windtalkers/framework/view');

/**
 *
 * @returns {ModalView}
 * @constructor
 */
function ModalView(){
    return ModalView.prototype.create({
        template : _.template(
            '<div class="modal-overlay"></div>'+
            '<div class="modal-window">' +
                '<div class="modal-contents"></div>' +
                '<button class="close"><%= this.trans.close %></button>' +
            '</div>'
        ),
        defaultTranslations : {
            close: "Close"
        },
        afterRender : function(rendered) {
            this.element = rendered;
            this.window = rendered.filter('.modal-window').hide();
            this.overlay = rendered.filter('.modal-overlay').hide();
        }
    });
}

module.exports = View.prototype.extend(ModalView);