"use strict";

var View = require('windtalkers/framework/view');

/**
 * @returns {MapView}
 * @constructor
 */
function MapView(google){
    return MapView.prototype.create(function(instance){
        instance.gmaps = google.maps;
    });
}

module.exports = View.prototype.extend(View, MapView, {
    defaultTranslations : {
        show_all : "Show all"
    },
    /**
     * @type {Function}
     */
    template : _.template(
        '<div class="controls">' +
            '<button class="tiny" id="show-all-markers"><%= t.show_all %></button>' +
        '</div>'
    ),
    /**
     * Creates a new google.maps.Map
     * @see https://developers.google.com/maps/documentation/javascript/reference#Map
     * @param {HTMLElement} element
     * @param {Object} mapOptions see google.maps.MapOptions for valid options
     **/
    createMap: function(element, mapOptions){
        var gmaps = this.gmaps;
        return new gmaps.Map(element, _.defaults(mapOptions || {}, {
            center: new gmaps.LatLng(63.399313, 13.082236),
            zoom: 10,
            mapTypeId: gmaps.MapTypeId.ROADMAP
        }));
    },
    /**
     * Update map with new markers.
     * This deletes any existing markers and resets the bounds and zoom of the map.
     * @param {Object} data
     * @param {Function} onClick - callback function when marker is clicked
     * @returns {Object} data
     */
    updateMap: function (data, onClick) {
        var map = data.map;
        var markers;
        var gmaps = this.gmaps;

        /**
         * Creates an icon for station depending on station state.
         * Can be either a cross for an offline station or an arrow displaying wind direction.
         * @param {Station} station
         * @returns {MapView.Icon}
         * @constructor
         */
        function Icon(station){
            var color, observation = station.latestObservation;
            var beaufort = {
                1: {
                    min: 0,
                    max: 0.3,
                    color: "#FFF"
                },
                2: {
                    min: 0.3,
                    max:3.5,
                    color: "#A4F5CC"
                },
                3: {
                    min: 3.5,
                    max: 5.5,
                    color: "#99FF99"
                },
                4: {
                    min: 5.5,
                    max: 7.9,
                    color: "#99FF66"
                },
                5: {
                    min: 8.0,
                    max: 10.8,
                    color: "#99FF00"
                },
                6: {
                    min: 10.8,
                    max: 13.8,
                    color: "#CCFF00"
                },
                7: {
                    min: 13.9,
                    max: 17.2,
                    color: "#FFFF00"
                },
                8: {
                    min: 17.2,
                    max: 20.8,
                    color: "#FFCC00"
                },
                9: {
                    min: 20.8,
                    max: 24.5,
                    color: "#FF9900"
                },
                10: {
                    min: 24.5,
                    max: 28.5,
                    color: "#FF6600"
                },
                11: {
                    min: 28.5,
                    max: 32.7,
                    color: "#FF3300"
                },
                12: {
                    min: 32.7,
                    max: 999,
                    color: "#FF0000"
                }
            };

            // Defaults
            _.extend(this, {
                fillOpacity: 0.8,
                strokeColor: 'black',
                strokeWeight: 1.2
            });
            if (!station.offline && observation) {
                color = (_.find(beaufort, function(bf){
                    return (observation.speed >= bf.min && observation.speed < bf.max);
                })).color;
                _.extend(this, {
                    path: "M20,3.272c0,0,13.731,12.53,13.731,19.171S31.13,36.728,31.13,36.728S23.372,31.536,20,31.536 S8.87,36.728,8.87,36.728s-2.601-7.644-2.601-14.285S20,3.272,20,3.272z",
                    name: 'ArrowIcon',
                    size: new gmaps.Size(40, 40),
                    origin: new gmaps.Point(20,20),
                    anchor: new gmaps.Point(20, 20),
                    fillColor: color ? color : 'red',
                    rotation: 180.0 + observation.direction
                });
            } else {
                _.extend(this, {
                    path : "M42.143,34.055L30.611,22.523l11.531-11.531c-1.828-2.983-4.344-5.499-7.327-7.327L23.284,15.197L11.753,3.665 C8.77,5.493,6.254,8.009,4.426,10.992l11.531,11.531L4.426,34.055c1.828,2.983,4.344,5.499,7.327,7.327L23.284,29.85l11.531,11.531 C37.799,39.554,40.315,37.038,42.143,34.055z",
                    name: 'OfflineIcon',
                    size: new gmaps.Size(25, 25),
                    origin: new gmaps.Point(20, 20),
                    anchor: new gmaps.Point(23, 23),
                    fillColor: 'white'
                });
            }
            return this;
        }

        /**
         * Overlay label used to display station name and wind speed on map
         * derived from google.maps.OverlayView
         * @see https://developers.google.com/maps/documentation/javascript/reference#OverlayView
         * @param {Object} opt_options
         * @constructor
         */
        function Label(opt_options){
            // Initialization
            this.setValues(opt_options);
            // Label specific
            this.span_ = $('<span class="map-label-inner">')[0];
            this.div_ = $('<div class="map-label-outer" style="position: absolute; display: none">')[0];
            this.div_.appendChild(this.span_);
        }

        //noinspection JSUnusedGlobalSymbols
        Label.prototype = _.extend(new google.maps.OverlayView, {
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

        // Create a fresh bounds object
        map.bounds = new google.maps.LatLngBounds();
        // Delete any existing markers to avoid duplicates
        if (_.isArray(data.markers)) {
            data.markers = _.filter(data.markers, function(marker){
                marker.setMap(null);
                return false;
            });
        }
        markers = _.map(data.stations, function(station){
            return new gmaps.Marker({
                position: new gmaps.LatLng(station.latitude, station.longitude),
                title: station.name,
                map: map,
                icon: new Icon(station),
                id: station.id,
                station: station,
                label: new Label({
                    map: map,
                    text: station.toString()
                })
            });
        });
        // SIDE EFFECTS!!!!!
        _.each(markers, function(marker){
            map.bounds.extend(marker.position);
            marker.label.bindTo('position', marker, 'position');
            if (onClick) {
                google.maps.event.addListener(marker, 'click', onClick);
            }
        });
        map.fitBounds(map.bounds);
        return _.extend(data, {
            markers: markers
        });
    }
});