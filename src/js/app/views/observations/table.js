"use strict";

var View = require('windtalkers/framework/view');

/**
 *
 * @constructor
 */
function TableView(){
    return TableView.prototype.create({
        template : _.template('<table></table>')
    })
}

module.exports = View.prototype.extend(TableView, {});