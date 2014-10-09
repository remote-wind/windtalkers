"use strict";
// This file should not be required until google maps is loaded.
var gmaps = global.google.maps;
/**
 * Overlay label used to display station name and wind speed on map
 * derived from google.maps.OverlayView
 * @see https://developers.google.com/maps/documentation/javascript/reference#OverlayView
 * @param {Object} opt_options
 * @constructor
 */

function Label(opt_options) {
    // Initialization
    jQuery.extend(this, opt_options || {});

    this.setValues(opt_options);
    // Label specific
    this.span_ = document.createElement('div');
    this.span_.setAttribute('class', 'map-label-inner');
    this.div_ = document.createElement('div');
    this.div_.setAttribute('class', 'map-label-outer');
    this.div_.appendChild(this.span_);
    this.div_.style.cssText = 'position: absolute; display: none';
}
function Label(opt_options){
    // Initialization
    this.setValues(opt_options);
    // Label specific
    this.span_ = $('<span class="map-label-inner">')[0];
    this.div_ = $('<div class="map-label-outer" style="position: absolute; display: none">')[0];
    this.div_.appendChild(this.span_);
}
//noinspection JSUnusedGlobalSymbols
Label.prototype = _.extend(new global.google.maps.OverlayView, {
    /**
     * Implement this method to initialize the overlay DOM elements.
     * This method is called once after setMap() is called with a valid map.
     * At this point, panes and projection will have been initialized.
     * @returns {void}
     */
    onAdd : function(){
        var label = this;
        this.getPanes().overlayLayer.appendChild(this.div_);
        // Ensures the label is redrawn if the text or position is changed.
        //noinspection JSUnusedGlobalSymbols
        this.listeners_ = _.map(['position_changed', 'text_changed'], function(event){
            return gmaps.event.addListener(this, event,
                function() { label.draw(); })
        });
    },
    /**
     * Implement this method to remove your elements from the DOM.
     * This method is called once following a call to setMap(null).
     * @returns {void}
     */
    onRemove : function() {
        this.div_.parentNode.removeChild(this.div_);
        // Remove all listeners
        //noinspection JSUnusedGlobalSymbols
        this.listeners_ = _.filter(function(listener){
            gmaps.event.removeListener(listener);
            return false;
        });
    },
    /**
     * Implement this method to draw or update the overlay.
     * This method is called after onAdd() and when the position from projection.fromLatLngToPixel()
     * would return a new value for a given LatLng. This can happen on change of zoom, center, or map type.
     * It is not necessarily called on drag or resize.
     * @returns {void}
     */
    draw : function() {
        var position = this.getProjection().fromLatLngToDivPixel(this.get('position'));
        this.span_.innerHTML = this.get('text');
        $(this.div_).css({
            left : position.x + 'px',
            top: position.y + 'px',
            display : 'block'
        });
    }
});

module.exports = Label;