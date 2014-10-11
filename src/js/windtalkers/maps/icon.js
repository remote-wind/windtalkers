"use strict";
/**
 * Creates an icon for station depending on station state.
 * Can be either a cross for an offline station or an arrow displaying wind direction.
 * @param {Station} station
 * @returns {MapView.Icon}
 * @constructor
 */
function Icon(station){
    var color, observation = station.latestObservation;
    var gmaps = global.google.maps;
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
}

module.exports = Icon;