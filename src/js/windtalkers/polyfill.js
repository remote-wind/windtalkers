"use strict";

/**
 * Object.create polyfill
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create#Polyfill
 */
if (typeof Object.create != 'function') {
    (function () {
        var F = function () {};
        Object.create = function (o) {
            if (arguments.length > 1) {
                throw Error('Second argument not supported');
            }
            if (typeof o != 'object') {
                throw TypeError('Argument must be an object');
            }
            F.prototype = o;
            return new F();
        };
    })();
}