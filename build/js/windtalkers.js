(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/index.js","/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer")
},{"base64-js":2,"buffer":1,"ieee754":3,"oMfpAn":4}],2:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/base64-js/lib/b64.js","/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/base64-js/lib")
},{"buffer":1,"oMfpAn":4}],3:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/ieee754/index.js","/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/buffer/node_modules/ieee754")
},{"buffer":1,"oMfpAn":4}],4:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/process/browser.js","/../../node_modules/gulp-browserify/node_modules/browserify/node_modules/process")
},{"buffer":1,"oMfpAn":4}],5:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Controller = require('windtalkers/framework/controller');
var ModalView = require('windtalkers/app/views/application/modal');

function ModalController($element){

    var $window = $(window),
        $body = $('body'),
        $document = $(document),
        instance = ModalController.prototype.create({
            /**
             *
             */
            view : ModalView()
            /**
             * Rendered view.
             */
         });

    $element.append(instance.view.render());
    $element.hide().children().hide();
    instance.view.root = $element;
    $body.append($element);

    instance.handlers = {
        close : $element.on('click', '.modal-overlay, .close', function(){ instance.close(); }),
        escape : $document.on('keyup', function(e){ if (e.keyCode === 27) instance.close(); }),
        resize: $window.add($body).on('resize scroll', _.throttle(function(){
            var $w = instance.view.window;
            $element.css({
                    width: $window.innerWidth(),
                    height: $(document).innerHeight()
                });
            $w.css({
                'margin-left' : -$w.width()/2,
                'margin-top' : -$w.height()/2
            });
        }, 500))
    };

    return instance;
}

module.exports = Controller.prototype.extend( Controller, ModalController, {
    /**
     *
     * @returns {Object} promise
     */
    close : function(){
        var view = this.view;
        var elem = this.view.root;
        var promise = $.when( view.window.hide().promise(), view.overlay.hide().promise() );
        return promise.done(function(win){
            win.children('.modal-contents').empty();
            elem.hide();
        });
    },
    /**
     *
     * @returns {Object} promise
     */
    show: function(content){
        var view = this.view;
        var popup = view.window;
        this.view.root.show();

        return $.when( view.overlay.show(10).promise() ).done(function(){
            popup.children('.modal-contents').append(content);
            popup.show();
            popup.css({
                'min-height' : "1px",
                'margin-left' : -popup.width()/2,
                'margin-top' : -popup.height()/2
            }).height(900);
        });
    }
});
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/app/controllers/modal_controller.js","/../../node_modules/windtalkers/app/controllers")
},{"buffer":1,"oMfpAn":4,"windtalkers/app/views/application/modal":10,"windtalkers/framework/controller":18}],6:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Controller = require('windtalkers/framework/controller');
var TableView = require('windtalkers/app/views/observations/table');
/**
 *
 * @param {jQuery} $elem
 * @returns {ObservationsController} instance
 * @constructor
 */
function ObservationsController($elem){
    return ObservationsController.prototype.create({
        element: $elem
    });
}

module.exports = Controller.prototype.extend(Controller, ObservationsController, {
    /**
     * Get observations for station.
     * @param {String|Number} stationId
     * @param {View} view - optional
     * @returns {Object} a promise
     */
    index: function(stationId, view){
        var controller = this;
        var view = view || TableView();
        var promise = $.when(this.client.getObservations(stationId), this.client.getStation(stationId));
        return promise.then(function(observations, station){
            return {
                element: controller.element,
                view: view,
                rendered: view.render({
                    observations: observations,
                    station: station
                }),
                observations: observations,
                station: station
            }
        }).then(function(state){
            controller.element.empty();
            controller.element.append(state.rendered);
            return state;
        });
    }
});
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/app/controllers/observations_controller.js","/../../node_modules/windtalkers/app/controllers")
},{"buffer":1,"oMfpAn":4,"windtalkers/app/views/observations/table":11,"windtalkers/framework/controller":18}],7:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Controller = require('windtalkers/framework/controller');
var MapView = require('windtalkers/app/views/stations/map');

/**
 *
 * @param {jQuery} $elem
 * @constructor
 */
function StationsController($elem){
   return StationsController.prototype.create({
       element : $elem
   });
}

module.exports = Controller.prototype.extend(Controller, StationsController, {
    /**
     * Show all stations
     * @param {View} view
     * @returns {Object} a promise
     */
    index : function(view) {
        var controller = this;
        view = view || MapView();
        return $.when(this.client.getStations())
            .then(function(stations){
                return {
                    element: controller.element,
                    view: view,
                    rendered: view.render({
                        stations: stations
                    })
                }
            }).then(function(state){
                controller.element.empty();
                controller.element.append(state.rendered);
                return state;
            });
    }
});
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/app/controllers/stations_controller.js","/../../node_modules/windtalkers/app/controllers")
},{"buffer":1,"oMfpAn":4,"windtalkers/app/views/stations/map":12,"windtalkers/framework/controller":18}],8:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Model = require('windtalkers/framework/model');

/**
 *
 * @param {Object} attributes
 * @returns {Observation}
 * @constructor does not need new keywod.
 */
function Observation(attributes){
    /**
     * @property {String|Number} id
     * @property {String|Number} station_id
     * @property {Number} speed (m/s)
     * @property {Number} direction (degrees)
     * @property {Number} max (m/s)
     * @property {Number} min (m/s)
     * @property {String} created_at - ISO 8601 created at date in station local time
     * @property {String} cardinal
     * @property {String} tstamp - created_at as a UTC unix timestamp
     */
    if (attributes) {
        attributes = _.extend(attributes, {
            date: new Date(attributes["tstamp"] * 1000),
            max: attributes["max_wind_speed"],
            min: attributes["min_wind_speed"]
        });
    }

    return Observation.prototype.create(attributes);
}

Model.prototype.extend(Model, Observation, {
    /**
     * Format created at date with clients localization settings
     * @param {Array} locales
     * @returns {string}
     */
    dateTime : function(locales){
        // Date takes UTC milliseconds
        if (this.date) return this.date.toLocaleString(locales);
    },
    /**
     * Helper method that formats wind speed according to `avg (min-max)`
     * @returns {String}
     */
    windSpeed : function(){
        return _.template('<%= speed %>&thinsp;(<%= min %>-<%= max %>) ms', this);
    },
    /**
     * Helper method that outputs compass direction and degrees
     * @returns {String}
     */
    degreesAndCardinal : function(){
        return _.template('<%= cardinal %>&thinsp;(<%= direction %>°)', this);
    }
});
module.exports = Observation;
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/app/models/observation.js","/../../node_modules/windtalkers/app/models")
},{"buffer":1,"oMfpAn":4,"windtalkers/framework/model":21}],9:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Model = require('windtalkers/framework/model');
var Observation = require('windtalkers/app/models/observation');
/**
 * @constructor does not require use of `new` keyword.
 */
function Station(attributes){
    if (attributes) {
        attributes =_.extend(attributes, {
            latestObservation: attributes["latest_observation"] ? Observation(attributes["latest_observation"]["observation"]) : null
        });
    }
    // "super" constructor call
    return Station.prototype.create(attributes);
}

Model.prototype.extend(Model, Station, {
    /**
     * Overrides Object.toString method to output the name of the station
     * @returns {string}
     */
    toString : function() {
        if (this.offline) {
            return this.name + ' <br> ' + 'Offline'
        } else if (this.latestObservation) {
            return this.name + ' <br> ' + this.latestObservation.windSpeed();
        }
    }
});
module.exports = Station;
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/app/models/station.js","/../../node_modules/windtalkers/app/models")
},{"buffer":1,"oMfpAn":4,"windtalkers/app/models/observation":8,"windtalkers/framework/model":21}],10:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
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

module.exports = View.prototype.extend(View, ModalView);
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/app/views/application/modal.js","/../../node_modules/windtalkers/app/views/application")
},{"buffer":1,"oMfpAn":4,"windtalkers/framework/view":22}],11:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var View = require('windtalkers/framework/view');
/**
 * @param {Object} options
 * @constructor
 */
function TableView(options){
    options = _.defaults(options || {}, {
        per_page: 20
    });
    /**
     * Bind event handlers for pagination
     * @param {jQuery} template
     * @returns {jQuery}
     */
    function paginate(template, options) {
        var observations = template.find('.observation');
        var pagination = template.find('.pagination');
        var per_page = options.per_page;

        // add page classes
        observations.each(function(i){
            $(this).addClass('page-' + Math.floor(i/per_page + 1));
        });
        // Mark first page as active
        template.find('.pagination li:first').addClass('active');
        template.find('.observation:not(.page-1)').addClass('hidden');

        // when clicking a page number
        pagination.on('click', '.page', function(){
            var on_page = $(this).attr('href').replace('#', '.');
            pagination.find('li').removeClass('active');
            $(this).parent().addClass('active');
            observations.filter(on_page).removeClass('hidden');
            observations.not(on_page).addClass('hidden');
            return false;
        });
        return template;
    }

    return TableView.prototype.create({
        options: options,
        render: function(view_data){
            var per_page = this.options.per_page;
            view_data = _.defaults(view_data, {
                per_page: per_page,
                pages: Math.ceil(view_data.observations.length / per_page)
            });
            return paginate( TableView.prototype.render(view_data), options )
        }
    })
}

module.exports = View.prototype.extend(View, TableView, {
    defaultTranslations: {
        created_at: 'Time',
        speed: 'Wind speed',
        direction: 'Direction'
    },
    template: _.template(
        '<table>' +
            '<legend class="station-name"><%= this.station.name %></legend>' +
            '<thead>' +
                '<tr>' +
                    '<td><%= t.created_at %></td>' +
                    '<td><%= t.speed %></td>' +
                    '<td><%= t.direction %></td>' +
                '</tr>' +
            '</thead>' +
            '<tbody>' +
                '<% _.each(this.observations, function(obs, index) { %>' +
                '<tr class="observation" >' +
                    "<td class='created-at'><%= obs.dateTime() %></td>" +
                    "<td class='wind-speed'><%= obs.windSpeed() %></td>" +
                    "<td class='direction'><%= obs.degreesAndCardinal() %></td>" +
                '</tr>'+
                '<% }); %>' +
            '</tbody>' +
        '</table>' +
        '<nav class="pages">' +
            '<ul class="pagination">' +
            '<% _.times(this.pages, function(page){ page++; %>' +
                '<li><a class="page" href="#page-<%= page %>"><%= page %></a></li>' +
            '<% }); %>' +
            '</ul>' +
        '</nav>'
    )
});
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/app/views/observations/table.js","/../../node_modules/windtalkers/app/views/observations")
},{"buffer":1,"oMfpAn":4,"windtalkers/framework/view":22}],12:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var View = require('windtalkers/framework/view');

/**
 * @returns {MapView}
 * @constructor
 */
function MapView(google){
    return MapView.prototype.create(function(instance){
        if (google) {
            instance.gmaps = google.maps;
        }
    });
}

module.exports = View.prototype.extend(View, MapView, {
    defaultTranslations : {
        show_all : "Show all"
    },
    setGmaps : function(google_maps){
      this.gmaps = google_maps;
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
        var gmaps = global.google.maps;

        if (element.jquery) {
            element = element[0];
        }
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
        var gmaps = global.google.maps;

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
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/app/views/stations/map.js","/../../node_modules/windtalkers/app/views/stations")
},{"buffer":1,"oMfpAn":4,"windtalkers/framework/view":22}],13:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Widget = require('windtalkers/framework/widget');
var StationsController = require('windtalkers/app/controllers/stations_controller');
var MapView = require('windtalkers/app/views/stations/map');

/**
 * Widget that displays wind observations in reverse chronological order
 * @constructor
 */
function MapWidget(attrs){
    return MapWidget.prototype.create(attrs || {});
}

module.exports = Widget.prototype.extend(Widget, MapWidget, {
    name: "MapWidget",
    selector: '.map-widget',
    /**
     * @param {jQuery} $elem
     * @param {String|Number} stationId
     * @returns {TableWidget}
     */
    startUp: function($elem, stationId){
        var controller = StationsController($elem);
        var promise;
        var apiLoaded = jQuery.Deferred();
        jQuery.getScript('https://www.google.com/jsapi', function(){
            google.load('maps', '3', { other_params: 'sensor=false', callback: function(){
                apiLoaded.resolve();
            }});
        });
        promise = $.when(
            apiLoaded,
            controller.index(MapView())
        );
        promise.done(function(api, state){
            var view = state.view;
            state.map = view.createMap(state.element);
            view.updateMap(state);
            return state;
        });
        return MapWidget({
            controller : controller,
            promise : promise
        });
    }
});
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/app/widgets/map_widget.js","/../../node_modules/windtalkers/app/widgets")
},{"buffer":1,"oMfpAn":4,"windtalkers/app/controllers/stations_controller":7,"windtalkers/app/views/stations/map":12,"windtalkers/framework/widget":23}],14:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
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
     * @param {jQuery} $elem
     * @returns {ModalWidget}
     */
    startUp: function($elem){
        return ModalWidget.prototype.create({
            controller : ModalController($elem)
        });
    }
});
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/app/widgets/modal_widget.js","/../../node_modules/windtalkers/app/widgets")
},{"buffer":1,"oMfpAn":4,"windtalkers/app/controllers/modal_controller":5,"windtalkers/framework/widget":23}],15:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Widget = require('windtalkers/framework/widget');
var ObservationsController = require('windtalkers/app/controllers/observations_controller');
var TableView = require('windtalkers/app/views/observations/table');

/**
 * Widget that displays wind observations in reverse chronological order
 * @constructor
 */
function TableWidget(attrs){
    return TableWidget.prototype.create(attrs || {});
}

module.exports = Widget.prototype.extend(Widget, TableWidget, {
    name: "TableWidget",
    selector: '.table-widget',
    /**
     * @param {jQuery} $elem
     * @param {String|Number} stationId
     * @returns {TableWidget}
     */
    startUp: function($elem, stationId){
        var controller = ObservationsController($elem);
        stationId = stationId || $elem.data('stationId');

        return TableWidget({
            controller : controller,
            promise : controller.index(stationId, TableView())
        });
    }
});
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/app/widgets/table_widget.js","/../../node_modules/windtalkers/app/widgets")
},{"buffer":1,"oMfpAn":4,"windtalkers/app/controllers/observations_controller":6,"windtalkers/app/views/observations/table":11,"windtalkers/framework/widget":23}],16:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Station = require('windtalkers/app/models/station');
var Observation = require('windtalkers/app/models/observation');
/**
 * API client talks to the blast.nu json rest api via ajax.
 * This should be the ONE AND ONLY point of outside contact.
 *
 * All methods return a promise
 * (a plain javascript object with has the Common JS Promise/A interface)
 *
 * @see http://api.jquery.com/Types/#jqXHR
 * @see http://wiki.commonjs.org/wiki/Promises
 *
 * The API client takes the JSON response and converts to models though piping.
 *
 * @constructor
 * @see http://wiki.commonjs.org/wiki/Promises
 */
function ApiClient(){
    var baseUrl = 'http://www.blast.nu';

    /**
     * Get all stations
     * @returns {Object} a Promise object.
     */
    this.getStations = function(){
        return jQuery.ajax({
            dataType: 'json',
            url: baseUrl + '/stations.json'
        }).then(function(data){
            return _.map(data, function(s){
                return Station(s);
            });
        });
    };
    /**
     * Get a station
     * @param {String|Number} id can either be an id or a slug
     * @returns {Object} a Promise object
     */
    this.getStation = function(id) {
        return jQuery.ajax({
            dataType: 'json',
            url: baseUrl + '/stations/%id.json'.replace('%id', id)
        }).then(function(data){
            return Station(data);
        });
    };
    /**
     * Gets observations for a given station.
     * @param {String|Number} station_id can either be an id or a slug
     * @returns {Object} a Promise object
     */
    this.getObservations = function(station_id){
        return jQuery.ajax({
            dataType: 'json',
            url: baseUrl + '/stations/%id/observations.json'.replace('%id', station_id)
        }).then(function(data){
            return _.map(data, function(obj){
                return Observation(obj);
            });
        });
    };
}

module.exports = ApiClient;
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/framework/api_client.js","/../../node_modules/windtalkers/framework")
},{"buffer":1,"oMfpAn":4,"windtalkers/app/models/observation":8,"windtalkers/app/models/station":9}],17:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

/**
 * A simple service container that contains the registered widgets and handles startup and teardown.
 * @param {Object} options
 * @constructor
 */
function Container(options){
    this.options = _.defaults(options || {}, {
        /**
         *  @option context
         *  Can be used to limit the scope to search for widgets in.
         *  Also can be used to stub in a fixture.
         */
        context : $(document),
        baseUrl: 'http://www.blast.nu'
    });
}

Container.prototype = _.extend(Container.prototype, {
    /**
     * Takes several Widgets and combines into an object
     *
     * @param {array} array
     * @returns {Object} the registered widgets
     */
    register : function(array){
        return _.object(_.map(array,
            function(widget){
                return [
                    widget.prototype.name,
                    widget
                ]
            }
        ));
    },
    /**
     * Loops through the widget manifests and finds matching DOM elements and creates a widget instance for each.
     * The `.startUp` method is then called for each widget instance.
     * @param {Object} widgets
     * @param {Object} context
     * @returns {Object}
     */
    startAll : function(widgets, context){
        context = context || this.options.context;
        return _.each(widgets, function(widget){
            var elements = context.find(widget.prototype.selector);

            // Loop through matching DOM elements
            widget.instances = _.map(elements, function(elem){
                var instance = widget.prototype.create();
                instance.startUp($(elem));
                return instance;
            });
            return widget;
        });
    },
    /**
     * Runs after `.startAll` and calls the update method if available for each widget
     * @param {Object} widgets
     * @returns {Object} the updated widgets
     */
    updateAll : function(widgets) {
        var container = this;
        return _.each(widgets, function (widget) {
            widget.instances = _.each(widget.instances, function (instance) {
                if (typeof instance.update == "function") {
                    instance.update.call(instance, container);
                }
                return instance;
            });
            return widget;
        });
    }
});

/**
 * Create a new service container
 * @see Container for params.
 */
exports.create = (function() {
    return function(args) {
        return new Container(args);
    }
})();

exports.Constructor = Container;
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/framework/container.js","/../../node_modules/windtalkers/framework")
},{"buffer":1,"oMfpAn":4}],18:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var ApiClient = require('windtalkers/framework/api_client');
var Creator = require('windtalkers/framework/creator');

/**
 *
 * @constructor
 */
function Controller(){}

module.exports = Creator.prototype.extend(Creator, Controller, {
    client: new ApiClient()
});
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/framework/controller.js","/../../node_modules/windtalkers/framework")
},{"buffer":1,"oMfpAn":4,"windtalkers/framework/api_client":16,"windtalkers/framework/creator":19}],19:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Extendable = require('windtalkers/framework/extendable');

/**
 * The Alpha & Omega of object creation
 * @constructor
 */
function Creator(){}

module.exports = Extendable.prototype.extend(Extendable, Creator, {
    /**
     * Creates a new instance of the controller with props as properties.
     * @param {Object|Function} props
     *  functions should have the folling signature.
     *      function({Object} instance) -> {Object}
     * @returns {Object} a new model instance
     */
    create : function(props){
        var instance = Object.create(this);
        if (_.isFunction(props)) {
            props = props.call(this, instance);
        }
        return _.extend(instance, props || {});
    }
});
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/framework/creator.js","/../../node_modules/windtalkers/framework")
},{"buffer":1,"oMfpAn":4,"windtalkers/framework/extendable":20}],20:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

function Extendable(){}

// Extend the extendable. How far out is this?
_.extend(Extendable.prototype, {
    /**
     * Extend "subclasses" with controller methods
     * @param {Function} parent
     * @param {Function} child
     * @param {Object|Function} extras - additional properties to add to prototype.
     * @returns {Function}
     */
    extend: function(parent, child, extras){
        child.prototype = _.extend(child.prototype, Object.create(parent.prototype));
        child.prototype.constructor = child;
        if (extras) {
            if (_.isFunction(extras)) {
                extras = extras.call(child, child, parent);
            }
            child.prototype = _.extend(child.prototype, extras || {});
        }
        return child;
    }
});
module.exports = Extendable;
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/framework/extendable.js","/../../node_modules/windtalkers/framework")
},{"buffer":1,"oMfpAn":4}],21:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Creator = require('windtalkers/framework/creator');

/**
 *
 * @constructor
 */
function Model(){}

module.exports = Creator.prototype.extend(Creator, Model);
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/framework/model.js","/../../node_modules/windtalkers/framework")
},{"buffer":1,"oMfpAn":4,"windtalkers/framework/creator":19}],22:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Creator = require('windtalkers/framework/creator');

/**
 * Used to create prototype for views.
 * @constructor not intended for direct use.
 */
function View(){}

module.exports = Creator.prototype.extend(Creator, View, {
    /**
     * Expands the .template with view_data assigned as the templates context
     *  This means that any view data can be accessed with `this` from the template
     * @param view_data
     * @param translations
     * @returns {jQuery}
     */
    render : function(view_data, translations){
        var rendered;

        view_data = view_data || {};
        translations =  _.defaults(translations || {}, this.defaultTranslations || {});
        rendered = $(this.template.call(
            _.extend(
                view_data, {
                    trans: _.defaults(translations || {}, this.defaultTranslations || {})
                }
            ),
            {
                // shortcut to translations
                t : translations
            }
        ));

        if (_.isFunction(this['afterRender'])) {
            this.afterRender(rendered);
        }

        return rendered;
    }
});
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/framework/view.js","/../../node_modules/windtalkers/framework")
},{"buffer":1,"oMfpAn":4,"windtalkers/framework/creator":19}],23:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

var Creator = require('windtalkers/framework/creator');

/**
 * @constructor
 */
function Widget(){}

module.exports = Creator.prototype.extend(Creator, Widget, {
    name: null,
    selector : null,
    startUp: function(){
        throw new Error("this.name "+"widget does not implement the .startUp method");
    },
    /**
     * Create wrapping element for creating widgets on the fly.
     * @returns {jQuery}
     */
    createElement : function(){
        return $('<div class="windtalkers-widget">')
            .addClass(this.selector.replace('.', ''));
    }
});
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/framework/widget.js","/../../node_modules/windtalkers/framework")
},{"buffer":1,"oMfpAn":4,"windtalkers/framework/creator":19}],24:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
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
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/polyfill.js","/../../node_modules/windtalkers")
},{"buffer":1,"oMfpAn":4}],25:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
"use strict";

require('windtalkers/polyfill');
var Creator = require('windtalkers/framework/creator');
var Container = require('windtalkers/framework/container');
var windtalkers;

function Windtalkers(options){
    return Windtalkers.prototype.create({
        container: Container.create(options)
    })
}

Creator.prototype.extend(Creator, Windtalkers, {
    init : function(){
        var widgets = {};
        widgets.registered = this.container.register([
            require('windtalkers/app/widgets/modal_widget'),
            require('windtalkers/app/widgets/table_widget'),
            require('windtalkers/app/widgets/map_widget')
        ]);
        widgets.started = this.container.startAll(widgets.registered);
        return widgets;
    }
});

jQuery(document).ready(function(){
    Windtalkers().init();
});

module.exports = Windtalkers;
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/fake_3f53266e.js","/")
},{"buffer":1,"oMfpAn":4,"windtalkers/app/widgets/map_widget":13,"windtalkers/app/widgets/modal_widget":14,"windtalkers/app/widgets/table_widget":15,"windtalkers/framework/container":17,"windtalkers/framework/creator":19,"windtalkers/polyfill":24}]},{},[25])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL21heGNhbC9wcm9qZWN0cy93aW5kdGFsa2Vycy1tb2NoYS9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwiL1VzZXJzL21heGNhbC9wcm9qZWN0cy93aW5kdGFsa2Vycy1tb2NoYS9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL2NvbnRyb2xsZXJzL21vZGFsX2NvbnRyb2xsZXIuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvY29udHJvbGxlcnMvb2JzZXJ2YXRpb25zX2NvbnRyb2xsZXIuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvY29udHJvbGxlcnMvc3RhdGlvbnNfY29udHJvbGxlci5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC9tb2RlbHMvb2JzZXJ2YXRpb24uanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvbW9kZWxzL3N0YXRpb24uanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvdmlld3MvYXBwbGljYXRpb24vbW9kYWwuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvdmlld3Mvb2JzZXJ2YXRpb25zL3RhYmxlLmpzIiwiL1VzZXJzL21heGNhbC9wcm9qZWN0cy93aW5kdGFsa2Vycy1tb2NoYS9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL3ZpZXdzL3N0YXRpb25zL21hcC5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC93aWRnZXRzL21hcF93aWRnZXQuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvd2lkZ2V0cy9tb2RhbF93aWRnZXQuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvd2lkZ2V0cy90YWJsZV93aWRnZXQuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmsvYXBpX2NsaWVudC5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jb250YWluZXIuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmsvY29udHJvbGxlci5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jcmVhdG9yLmpzIiwiL1VzZXJzL21heGNhbC9wcm9qZWN0cy93aW5kdGFsa2Vycy1tb2NoYS9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrL2V4dGVuZGFibGUuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmsvbW9kZWwuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmsvdmlldy5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay93aWRnZXQuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9wb2x5ZmlsbC5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvc3JjL2pzL2Zha2VfM2Y1MzI2NmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuLyohXG4gKiBUaGUgYnVmZmVyIG1vZHVsZSBmcm9tIG5vZGUuanMsIGZvciB0aGUgYnJvd3Nlci5cbiAqXG4gKiBAYXV0aG9yICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIEBsaWNlbnNlICBNSVRcbiAqL1xuXG52YXIgYmFzZTY0ID0gcmVxdWlyZSgnYmFzZTY0LWpzJylcbnZhciBpZWVlNzU0ID0gcmVxdWlyZSgnaWVlZTc1NCcpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MlxuXG4vKipcbiAqIElmIGBCdWZmZXIuX3VzZVR5cGVkQXJyYXlzYDpcbiAqICAgPT09IHRydWUgICAgVXNlIFVpbnQ4QXJyYXkgaW1wbGVtZW50YXRpb24gKGZhc3Rlc3QpXG4gKiAgID09PSBmYWxzZSAgIFVzZSBPYmplY3QgaW1wbGVtZW50YXRpb24gKGNvbXBhdGlibGUgZG93biB0byBJRTYpXG4gKi9cbkJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgPSAoZnVuY3Rpb24gKCkge1xuICAvLyBEZXRlY3QgaWYgYnJvd3NlciBzdXBwb3J0cyBUeXBlZCBBcnJheXMuIFN1cHBvcnRlZCBicm93c2VycyBhcmUgSUUgMTArLCBGaXJlZm94IDQrLFxuICAvLyBDaHJvbWUgNyssIFNhZmFyaSA1LjErLCBPcGVyYSAxMS42KywgaU9TIDQuMisuIElmIHRoZSBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgYWRkaW5nXG4gIC8vIHByb3BlcnRpZXMgdG8gYFVpbnQ4QXJyYXlgIGluc3RhbmNlcywgdGhlbiB0aGF0J3MgdGhlIHNhbWUgYXMgbm8gYFVpbnQ4QXJyYXlgIHN1cHBvcnRcbiAgLy8gYmVjYXVzZSB3ZSBuZWVkIHRvIGJlIGFibGUgdG8gYWRkIGFsbCB0aGUgbm9kZSBCdWZmZXIgQVBJIG1ldGhvZHMuIFRoaXMgaXMgYW4gaXNzdWVcbiAgLy8gaW4gRmlyZWZveCA0LTI5LiBOb3cgZml4ZWQ6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOFxuICB0cnkge1xuICAgIHZhciBidWYgPSBuZXcgQXJyYXlCdWZmZXIoMClcbiAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoYnVmKVxuICAgIGFyci5mb28gPSBmdW5jdGlvbiAoKSB7IHJldHVybiA0MiB9XG4gICAgcmV0dXJuIDQyID09PSBhcnIuZm9vKCkgJiZcbiAgICAgICAgdHlwZW9mIGFyci5zdWJhcnJheSA9PT0gJ2Z1bmN0aW9uJyAvLyBDaHJvbWUgOS0xMCBsYWNrIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gV29ya2Fyb3VuZDogbm9kZSdzIGJhc2U2NCBpbXBsZW1lbnRhdGlvbiBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgc3RyaW5nc1xuICAvLyB3aGlsZSBiYXNlNjQtanMgZG9lcyBub3QuXG4gIGlmIChlbmNvZGluZyA9PT0gJ2Jhc2U2NCcgJiYgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBzdWJqZWN0ID0gc3RyaW5ndHJpbShzdWJqZWN0KVxuICAgIHdoaWxlIChzdWJqZWN0Lmxlbmd0aCAlIDQgIT09IDApIHtcbiAgICAgIHN1YmplY3QgPSBzdWJqZWN0ICsgJz0nXG4gICAgfVxuICB9XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0KVxuICBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJylcbiAgICBsZW5ndGggPSBCdWZmZXIuYnl0ZUxlbmd0aChzdWJqZWN0LCBlbmNvZGluZylcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QubGVuZ3RoKSAvLyBhc3N1bWUgdGhhdCBvYmplY3QgaXMgYXJyYXktbGlrZVxuICBlbHNlXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGaXJzdCBhcmd1bWVudCBuZWVkcyB0byBiZSBhIG51bWJlciwgYXJyYXkgb3Igc3RyaW5nLicpXG5cbiAgdmFyIGJ1ZlxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBCdWZmZXIuX2F1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIFRISVMgaW5zdGFuY2Ugb2YgQnVmZmVyIChjcmVhdGVkIGJ5IGBuZXdgKVxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gICAgYnVmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmIHR5cGVvZiBzdWJqZWN0LmJ5dGVMZW5ndGggPT09ICdudW1iZXInKSB7XG4gICAgLy8gU3BlZWQgb3B0aW1pemF0aW9uIC0tIHVzZSBzZXQgaWYgd2UncmUgY29weWluZyBmcm9tIGEgdHlwZWQgYXJyYXlcbiAgICBidWYuX3NldChzdWJqZWN0KVxuICB9IGVsc2UgaWYgKGlzQXJyYXlpc2goc3ViamVjdCkpIHtcbiAgICAvLyBUcmVhdCBhcnJheS1pc2ggb2JqZWN0cyBhcyBhIGJ5dGUgYXJyYXlcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkpXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3QucmVhZFVJbnQ4KGkpXG4gICAgICBlbHNlXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3RbaV1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBidWYud3JpdGUoc3ViamVjdCwgMCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgIUJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgIW5vWmVybykge1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgYnVmW2ldID0gMFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBidWZcbn1cblxuLy8gU1RBVElDIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09XG5cbkJ1ZmZlci5pc0VuY29kaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nKSB7XG4gIHN3aXRjaCAoU3RyaW5nKGVuY29kaW5nKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICBjYXNlICdyYXcnOlxuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiAoYikge1xuICByZXR1cm4gISEoYiAhPT0gbnVsbCAmJiBiICE9PSB1bmRlZmluZWQgJiYgYi5faXNCdWZmZXIpXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldFxuICBzdHIgPSBzdHIgKyAnJ1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoIC8gMlxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdyYXcnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAqIDJcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIuY29uY2F0ID0gZnVuY3Rpb24gKGxpc3QsIHRvdGFsTGVuZ3RoKSB7XG4gIGFzc2VydChpc0FycmF5KGxpc3QpLCAnVXNhZ2U6IEJ1ZmZlci5jb25jYXQobGlzdCwgW3RvdGFsTGVuZ3RoXSlcXG4nICtcbiAgICAgICdsaXN0IHNob3VsZCBiZSBhbiBBcnJheS4nKVxuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKDApXG4gIH0gZWxzZSBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gbGlzdFswXVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB0b3RhbExlbmd0aCAhPT0gJ251bWJlcicpIHtcbiAgICB0b3RhbExlbmd0aCA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgdG90YWxMZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcih0b3RhbExlbmd0aClcbiAgdmFyIHBvcyA9IDBcbiAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgaXRlbSA9IGxpc3RbaV1cbiAgICBpdGVtLmNvcHkoYnVmLCBwb3MpXG4gICAgcG9zICs9IGl0ZW0ubGVuZ3RoXG4gIH1cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBCVUZGRVIgSU5TVEFOQ0UgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gX2hleFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gYnVmLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG5cbiAgLy8gbXVzdCBiZSBhbiBldmVuIG51bWJlciBvZiBkaWdpdHNcbiAgdmFyIHN0ckxlbiA9IHN0cmluZy5sZW5ndGhcbiAgYXNzZXJ0KHN0ckxlbiAlIDIgPT09IDAsICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBhc3NlcnQoIWlzTmFOKGJ5dGUpLCAnSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPSBpICogMlxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBfdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjhUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2FzY2lpV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2JpbmFyeVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIF9hc2NpaVdyaXRlKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGJhc2U2NFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfdXRmMTZsZVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjE2bGVUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gX2hleFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IF91dGY4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0ID0gX2FzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IF9iaW5hcnlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gX2Jhc2U2NFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBfdXRmMTZsZVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgc2VsZiA9IHRoaXNcblxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcbiAgc3RhcnQgPSBOdW1iZXIoc3RhcnQpIHx8IDBcbiAgZW5kID0gKGVuZCAhPT0gdW5kZWZpbmVkKVxuICAgID8gTnVtYmVyKGVuZClcbiAgICA6IGVuZCA9IHNlbGYubGVuZ3RoXG5cbiAgLy8gRmFzdHBhdGggZW1wdHkgc3RyaW5nc1xuICBpZiAoZW5kID09PSBzdGFydClcbiAgICByZXR1cm4gJydcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gX2hleFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IF91dGY4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0ID0gX2FzY2lpU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IF9iaW5hcnlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gX2Jhc2U2NFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBfdXRmMTZsZVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogJ0J1ZmZlcicsXG4gICAgZGF0YTogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5fYXJyIHx8IHRoaXMsIDApXG4gIH1cbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKHRhcmdldCwgdGFyZ2V0X3N0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIHZhciBzb3VyY2UgPSB0aGlzXG5cbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKCF0YXJnZXRfc3RhcnQpIHRhcmdldF9zdGFydCA9IDBcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdzb3VyY2VFbmQgPCBzb3VyY2VTdGFydCcpXG4gIGFzc2VydCh0YXJnZXRfc3RhcnQgPj0gMCAmJiB0YXJnZXRfc3RhcnQgPCB0YXJnZXQubGVuZ3RoLFxuICAgICAgJ3RhcmdldFN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSBzb3VyY2UubGVuZ3RoLCAnc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aClcbiAgICBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCA8IGVuZCAtIHN0YXJ0KVxuICAgIGVuZCA9IHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgKyBzdGFydFxuXG4gIHZhciBsZW4gPSBlbmQgLSBzdGFydFxuXG4gIGlmIChsZW4gPCAxMDAgfHwgIUJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgdGFyZ2V0W2kgKyB0YXJnZXRfc3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG4gIH0gZWxzZSB7XG4gICAgdGFyZ2V0Ll9zZXQodGhpcy5zdWJhcnJheShzdGFydCwgc3RhcnQgKyBsZW4pLCB0YXJnZXRfc3RhcnQpXG4gIH1cbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKHN0YXJ0ID09PSAwICYmIGVuZCA9PT0gYnVmLmxlbmd0aCkge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1Zi5zbGljZShzdGFydCwgZW5kKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBfdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKylcbiAgICByZXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gX2JpbmFyeVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgcmV0dXJuIF9hc2NpaVNsaWNlKGJ1Ziwgc3RhcnQsIGVuZClcbn1cblxuZnVuY3Rpb24gX2hleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gX3V0ZjE2bGVTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBieXRlcyA9IGJ1Zi5zbGljZShzdGFydCwgZW5kKVxuICB2YXIgcmVzID0gJydcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkgKz0gMikge1xuICAgIHJlcyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldICsgYnl0ZXNbaSsxXSAqIDI1NilcbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgc3RhcnQgPSBjbGFtcChzdGFydCwgbGVuLCAwKVxuICBlbmQgPSBjbGFtcChlbmQsIGxlbiwgbGVuKVxuXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgcmV0dXJuIEJ1ZmZlci5fYXVnbWVudCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBlbmQpKVxuICB9IGVsc2Uge1xuICAgIHZhciBzbGljZUxlbiA9IGVuZCAtIHN0YXJ0XG4gICAgdmFyIG5ld0J1ZiA9IG5ldyBCdWZmZXIoc2xpY2VMZW4sIHVuZGVmaW5lZCwgdHJ1ZSlcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNsaWNlTGVuOyBpKyspIHtcbiAgICAgIG5ld0J1ZltpXSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgICByZXR1cm4gbmV3QnVmXG4gIH1cbn1cblxuLy8gYGdldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLmdldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMucmVhZFVJbnQ4KG9mZnNldClcbn1cblxuLy8gYHNldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKHYsIG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLnNldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMud3JpdGVVSW50OCh2LCBvZmZzZXQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgdmFsID0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICB9IGVsc2Uge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV1cbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDJdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgICB2YWwgfD0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0ICsgM10gPDwgMjQgPj4+IDApXG4gIH0gZWxzZSB7XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMV0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMl0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAzXVxuICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0XSA8PCAyNCA+Pj4gMClcbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsXG4gICAgICAgICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICB2YXIgbmVnID0gdGhpc1tvZmZzZXRdICYgMHg4MFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZiAtIHRoaXNbb2Zmc2V0XSArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQxNihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MzIoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMDAwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZmZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRmxvYXQgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWREb3VibGUgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aCkgcmV0dXJuXG5cbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCAyKTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSAmICgweGZmIDw8ICg4ICogKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkpKSkgPj4+XG4gICAgICAgICAgICAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSAqIDhcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZmZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgNCk7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgPj4+IChsaXR0bGVFbmRpYW4gPyBpIDogMyAtIGkpICogOCkgJiAweGZmXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2YsIC0weDgwKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICB0aGlzLndyaXRlVUludDgodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICB0aGlzLndyaXRlVUludDgoMHhmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmLCAtMHg4MDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQxNihidWYsIDB4ZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQzMihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MzIoYnVmLCAweGZmZmZmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdExFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZURvdWJsZSAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCxcbiAgICAgICAgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAxLjc5NzY5MzEzNDg2MjMxNTdFKzMwOCwgLTEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG4vLyBmaWxsKHZhbHVlLCBzdGFydD0wLCBlbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuZmlsbCA9IGZ1bmN0aW9uICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgdmFsdWUgPSB2YWx1ZS5jaGFyQ29kZUF0KDApXG4gIH1cblxuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiAhaXNOYU4odmFsdWUpLCAndmFsdWUgaXMgbm90IGEgbnVtYmVyJylcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ2VuZCA8IHN0YXJ0JylcblxuICAvLyBGaWxsIDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGhpcy5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgdGhpcy5sZW5ndGgsICdzdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSB0aGlzLmxlbmd0aCwgJ2VuZCBvdXQgb2YgYm91bmRzJylcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHRoaXNbaV0gPSB2YWx1ZVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG91dCA9IFtdXG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgb3V0W2ldID0gdG9IZXgodGhpc1tpXSlcbiAgICBpZiAoaSA9PT0gZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUykge1xuICAgICAgb3V0W2kgKyAxXSA9ICcuLi4nXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIG91dC5qb2luKCcgJykgKyAnPidcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAgIHJldHVybiAobmV3IEJ1ZmZlcih0aGlzKSkuYnVmZmVyXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBidWYgPSBuZXcgVWludDhBcnJheSh0aGlzLmxlbmd0aClcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBidWYubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDEpXG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignQnVmZmVyLnRvQXJyYXlCdWZmZXIgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGJyb3dzZXInKVxuICB9XG59XG5cbi8vIEhFTFBFUiBGVU5DVElPTlNcbi8vID09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxudmFyIEJQID0gQnVmZmVyLnByb3RvdHlwZVxuXG4vKipcbiAqIEF1Z21lbnQgYSBVaW50OEFycmF5ICppbnN0YW5jZSogKG5vdCB0aGUgVWludDhBcnJheSBjbGFzcyEpIHdpdGggQnVmZmVyIG1ldGhvZHNcbiAqL1xuQnVmZmVyLl9hdWdtZW50ID0gZnVuY3Rpb24gKGFycikge1xuICBhcnIuX2lzQnVmZmVyID0gdHJ1ZVxuXG4gIC8vIHNhdmUgcmVmZXJlbmNlIHRvIG9yaWdpbmFsIFVpbnQ4QXJyYXkgZ2V0L3NldCBtZXRob2RzIGJlZm9yZSBvdmVyd3JpdGluZ1xuICBhcnIuX2dldCA9IGFyci5nZXRcbiAgYXJyLl9zZXQgPSBhcnIuc2V0XG5cbiAgLy8gZGVwcmVjYXRlZCwgd2lsbCBiZSByZW1vdmVkIGluIG5vZGUgMC4xMytcbiAgYXJyLmdldCA9IEJQLmdldFxuICBhcnIuc2V0ID0gQlAuc2V0XG5cbiAgYXJyLndyaXRlID0gQlAud3JpdGVcbiAgYXJyLnRvU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvTG9jYWxlU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvSlNPTiA9IEJQLnRvSlNPTlxuICBhcnIuY29weSA9IEJQLmNvcHlcbiAgYXJyLnNsaWNlID0gQlAuc2xpY2VcbiAgYXJyLnJlYWRVSW50OCA9IEJQLnJlYWRVSW50OFxuICBhcnIucmVhZFVJbnQxNkxFID0gQlAucmVhZFVJbnQxNkxFXG4gIGFyci5yZWFkVUludDE2QkUgPSBCUC5yZWFkVUludDE2QkVcbiAgYXJyLnJlYWRVSW50MzJMRSA9IEJQLnJlYWRVSW50MzJMRVxuICBhcnIucmVhZFVJbnQzMkJFID0gQlAucmVhZFVJbnQzMkJFXG4gIGFyci5yZWFkSW50OCA9IEJQLnJlYWRJbnQ4XG4gIGFyci5yZWFkSW50MTZMRSA9IEJQLnJlYWRJbnQxNkxFXG4gIGFyci5yZWFkSW50MTZCRSA9IEJQLnJlYWRJbnQxNkJFXG4gIGFyci5yZWFkSW50MzJMRSA9IEJQLnJlYWRJbnQzMkxFXG4gIGFyci5yZWFkSW50MzJCRSA9IEJQLnJlYWRJbnQzMkJFXG4gIGFyci5yZWFkRmxvYXRMRSA9IEJQLnJlYWRGbG9hdExFXG4gIGFyci5yZWFkRmxvYXRCRSA9IEJQLnJlYWRGbG9hdEJFXG4gIGFyci5yZWFkRG91YmxlTEUgPSBCUC5yZWFkRG91YmxlTEVcbiAgYXJyLnJlYWREb3VibGVCRSA9IEJQLnJlYWREb3VibGVCRVxuICBhcnIud3JpdGVVSW50OCA9IEJQLndyaXRlVUludDhcbiAgYXJyLndyaXRlVUludDE2TEUgPSBCUC53cml0ZVVJbnQxNkxFXG4gIGFyci53cml0ZVVJbnQxNkJFID0gQlAud3JpdGVVSW50MTZCRVxuICBhcnIud3JpdGVVSW50MzJMRSA9IEJQLndyaXRlVUludDMyTEVcbiAgYXJyLndyaXRlVUludDMyQkUgPSBCUC53cml0ZVVJbnQzMkJFXG4gIGFyci53cml0ZUludDggPSBCUC53cml0ZUludDhcbiAgYXJyLndyaXRlSW50MTZMRSA9IEJQLndyaXRlSW50MTZMRVxuICBhcnIud3JpdGVJbnQxNkJFID0gQlAud3JpdGVJbnQxNkJFXG4gIGFyci53cml0ZUludDMyTEUgPSBCUC53cml0ZUludDMyTEVcbiAgYXJyLndyaXRlSW50MzJCRSA9IEJQLndyaXRlSW50MzJCRVxuICBhcnIud3JpdGVGbG9hdExFID0gQlAud3JpdGVGbG9hdExFXG4gIGFyci53cml0ZUZsb2F0QkUgPSBCUC53cml0ZUZsb2F0QkVcbiAgYXJyLndyaXRlRG91YmxlTEUgPSBCUC53cml0ZURvdWJsZUxFXG4gIGFyci53cml0ZURvdWJsZUJFID0gQlAud3JpdGVEb3VibGVCRVxuICBhcnIuZmlsbCA9IEJQLmZpbGxcbiAgYXJyLmluc3BlY3QgPSBCUC5pbnNwZWN0XG4gIGFyci50b0FycmF5QnVmZmVyID0gQlAudG9BcnJheUJ1ZmZlclxuXG4gIHJldHVybiBhcnJcbn1cblxuLy8gc2xpY2Uoc3RhcnQsIGVuZClcbmZ1bmN0aW9uIGNsYW1wIChpbmRleCwgbGVuLCBkZWZhdWx0VmFsdWUpIHtcbiAgaWYgKHR5cGVvZiBpbmRleCAhPT0gJ251bWJlcicpIHJldHVybiBkZWZhdWx0VmFsdWVcbiAgaW5kZXggPSB+fmluZGV4OyAgLy8gQ29lcmNlIHRvIGludGVnZXIuXG4gIGlmIChpbmRleCA+PSBsZW4pIHJldHVybiBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICBpbmRleCArPSBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBjb2VyY2UgKGxlbmd0aCkge1xuICAvLyBDb2VyY2UgbGVuZ3RoIHRvIGEgbnVtYmVyIChwb3NzaWJseSBOYU4pLCByb3VuZCB1cFxuICAvLyBpbiBjYXNlIGl0J3MgZnJhY3Rpb25hbCAoZS5nLiAxMjMuNDU2KSB0aGVuIGRvIGFcbiAgLy8gZG91YmxlIG5lZ2F0ZSB0byBjb2VyY2UgYSBOYU4gdG8gMC4gRWFzeSwgcmlnaHQ/XG4gIGxlbmd0aCA9IH5+TWF0aC5jZWlsKCtsZW5ndGgpXG4gIHJldHVybiBsZW5ndGggPCAwID8gMCA6IGxlbmd0aFxufVxuXG5mdW5jdGlvbiBpc0FycmF5IChzdWJqZWN0KSB7XG4gIHJldHVybiAoQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoc3ViamVjdCkge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc3ViamVjdCkgPT09ICdbb2JqZWN0IEFycmF5XSdcbiAgfSkoc3ViamVjdClcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYiA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaWYgKGIgPD0gMHg3RilcbiAgICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpKVxuICAgIGVsc2Uge1xuICAgICAgdmFyIHN0YXJ0ID0gaVxuICAgICAgaWYgKGIgPj0gMHhEODAwICYmIGIgPD0gMHhERkZGKSBpKytcbiAgICAgIHZhciBoID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0ci5zbGljZShzdGFydCwgaSsxKSkuc3Vic3RyKDEpLnNwbGl0KCclJylcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaC5sZW5ndGg7IGorKylcbiAgICAgICAgYnl0ZUFycmF5LnB1c2gocGFyc2VJbnQoaFtqXSwgMTYpKVxuICAgIH1cbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGFzY2lpVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIC8vIE5vZGUncyBjb2RlIHNlZW1zIHRvIGJlIGRvaW5nIHRoaXMgYW5kIG5vdCAmIDB4N0YuLlxuICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRilcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGMsIGhpLCBsb1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICBjID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBoaSA9IGMgPj4gOFxuICAgIGxvID0gYyAlIDI1NlxuICAgIGJ5dGVBcnJheS5wdXNoKGxvKVxuICAgIGJ5dGVBcnJheS5wdXNoKGhpKVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBiYXNlNjRUb0J5dGVzIChzdHIpIHtcbiAgcmV0dXJuIGJhc2U2NC50b0J5dGVBcnJheShzdHIpXG59XG5cbmZ1bmN0aW9uIGJsaXRCdWZmZXIgKHNyYywgZHN0LCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgcG9zXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKGkgKyBvZmZzZXQgPj0gZHN0Lmxlbmd0aCkgfHwgKGkgPj0gc3JjLmxlbmd0aCkpXG4gICAgICBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIGRlY29kZVV0ZjhDaGFyIChzdHIpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHN0cilcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoMHhGRkZEKSAvLyBVVEYgOCBpbnZhbGlkIGNoYXJcbiAgfVxufVxuXG4vKlxuICogV2UgaGF2ZSB0byBtYWtlIHN1cmUgdGhhdCB0aGUgdmFsdWUgaXMgYSB2YWxpZCBpbnRlZ2VyLiBUaGlzIG1lYW5zIHRoYXQgaXRcbiAqIGlzIG5vbi1uZWdhdGl2ZS4gSXQgaGFzIG5vIGZyYWN0aW9uYWwgY29tcG9uZW50IGFuZCB0aGF0IGl0IGRvZXMgbm90XG4gKiBleGNlZWQgdGhlIG1heGltdW0gYWxsb3dlZCB2YWx1ZS5cbiAqL1xuZnVuY3Rpb24gdmVyaWZ1aW50ICh2YWx1ZSwgbWF4KSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA+PSAwLCAnc3BlY2lmaWVkIGEgbmVnYXRpdmUgdmFsdWUgZm9yIHdyaXRpbmcgYW4gdW5zaWduZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgaXMgbGFyZ2VyIHRoYW4gbWF4aW11bSB2YWx1ZSBmb3IgdHlwZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmc2ludCAodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmSUVFRTc1NCAodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG59XG5cbmZ1bmN0aW9uIGFzc2VydCAodGVzdCwgbWVzc2FnZSkge1xuICBpZiAoIXRlc3QpIHRocm93IG5ldyBFcnJvcihtZXNzYWdlIHx8ICdGYWlsZWQgYXNzZXJ0aW9uJylcbn1cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG52YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG47KGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuICB2YXIgQXJyID0gKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJylcbiAgICA/IFVpbnQ4QXJyYXlcbiAgICA6IEFycmF5XG5cblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTKVxuXHRcdFx0cmV0dXJuIDYyIC8vICcrJ1xuXHRcdGlmIChjb2RlID09PSBTTEFTSClcblx0XHRcdHJldHVybiA2MyAvLyAnLydcblx0XHRpZiAoY29kZSA8IE5VTUJFUilcblx0XHRcdHJldHVybiAtMSAvL25vIG1hdGNoXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIgKyAxMClcblx0XHRcdHJldHVybiBjb2RlIC0gTlVNQkVSICsgMjYgKyAyNlxuXHRcdGlmIChjb2RlIDwgVVBQRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gVVBQRVJcblx0XHRpZiAoY29kZSA8IExPV0VSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIExPV0VSICsgMjZcblx0fVxuXG5cdGZ1bmN0aW9uIGI2NFRvQnl0ZUFycmF5IChiNjQpIHtcblx0XHR2YXIgaSwgaiwgbCwgdG1wLCBwbGFjZUhvbGRlcnMsIGFyclxuXG5cdFx0aWYgKGI2NC5sZW5ndGggJSA0ID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0Jylcblx0XHR9XG5cblx0XHQvLyB0aGUgbnVtYmVyIG9mIGVxdWFsIHNpZ25zIChwbGFjZSBob2xkZXJzKVxuXHRcdC8vIGlmIHRoZXJlIGFyZSB0d28gcGxhY2Vob2xkZXJzLCB0aGFuIHRoZSB0d28gY2hhcmFjdGVycyBiZWZvcmUgaXRcblx0XHQvLyByZXByZXNlbnQgb25lIGJ5dGVcblx0XHQvLyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgdGhlbiB0aGUgdGhyZWUgY2hhcmFjdGVycyBiZWZvcmUgaXQgcmVwcmVzZW50IDIgYnl0ZXNcblx0XHQvLyB0aGlzIGlzIGp1c3QgYSBjaGVhcCBoYWNrIHRvIG5vdCBkbyBpbmRleE9mIHR3aWNlXG5cdFx0dmFyIGxlbiA9IGI2NC5sZW5ndGhcblx0XHRwbGFjZUhvbGRlcnMgPSAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMikgPyAyIDogJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDEpID8gMSA6IDBcblxuXHRcdC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuXHRcdGFyciA9IG5ldyBBcnIoYjY0Lmxlbmd0aCAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKVxuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHBsYWNlaG9sZGVycywgb25seSBnZXQgdXAgdG8gdGhlIGxhc3QgY29tcGxldGUgNCBjaGFyc1xuXHRcdGwgPSBwbGFjZUhvbGRlcnMgPiAwID8gYjY0Lmxlbmd0aCAtIDQgOiBiNjQubGVuZ3RoXG5cblx0XHR2YXIgTCA9IDBcblxuXHRcdGZ1bmN0aW9uIHB1c2ggKHYpIHtcblx0XHRcdGFycltMKytdID0gdlxuXHRcdH1cblxuXHRcdGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbDsgaSArPSA0LCBqICs9IDMpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTgpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgMTIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPDwgNikgfCBkZWNvZGUoYjY0LmNoYXJBdChpICsgMykpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDAwMCkgPj4gMTYpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDApID4+IDgpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpID4+IDQpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fSBlbHNlIGlmIChwbGFjZUhvbGRlcnMgPT09IDEpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTApIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgNCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA+PiAyKVxuXHRcdFx0cHVzaCgodG1wID4+IDgpICYgMHhGRilcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJyXG5cdH1cblxuXHRmdW5jdGlvbiB1aW50OFRvQmFzZTY0ICh1aW50OCkge1xuXHRcdHZhciBpLFxuXHRcdFx0ZXh0cmFCeXRlcyA9IHVpbnQ4Lmxlbmd0aCAlIDMsIC8vIGlmIHdlIGhhdmUgMSBieXRlIGxlZnQsIHBhZCAyIGJ5dGVzXG5cdFx0XHRvdXRwdXQgPSBcIlwiLFxuXHRcdFx0dGVtcCwgbGVuZ3RoXG5cblx0XHRmdW5jdGlvbiBlbmNvZGUgKG51bSkge1xuXHRcdFx0cmV0dXJuIGxvb2t1cC5jaGFyQXQobnVtKVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRyaXBsZXRUb0Jhc2U2NCAobnVtKSB7XG5cdFx0XHRyZXR1cm4gZW5jb2RlKG51bSA+PiAxOCAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiAxMiAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiA2ICYgMHgzRikgKyBlbmNvZGUobnVtICYgMHgzRilcblx0XHR9XG5cblx0XHQvLyBnbyB0aHJvdWdoIHRoZSBhcnJheSBldmVyeSB0aHJlZSBieXRlcywgd2UnbGwgZGVhbCB3aXRoIHRyYWlsaW5nIHN0dWZmIGxhdGVyXG5cdFx0Zm9yIChpID0gMCwgbGVuZ3RoID0gdWludDgubGVuZ3RoIC0gZXh0cmFCeXRlczsgaSA8IGxlbmd0aDsgaSArPSAzKSB7XG5cdFx0XHR0ZW1wID0gKHVpbnQ4W2ldIDw8IDE2KSArICh1aW50OFtpICsgMV0gPDwgOCkgKyAodWludDhbaSArIDJdKVxuXHRcdFx0b3V0cHV0ICs9IHRyaXBsZXRUb0Jhc2U2NCh0ZW1wKVxuXHRcdH1cblxuXHRcdC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcblx0XHRzd2l0Y2ggKGV4dHJhQnl0ZXMpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0dGVtcCA9IHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAyKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9PSdcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgMjpcblx0XHRcdFx0dGVtcCA9ICh1aW50OFt1aW50OC5sZW5ndGggLSAyXSA8PCA4KSArICh1aW50OFt1aW50OC5sZW5ndGggLSAxXSlcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDEwKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wID4+IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCAyKSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPSdcblx0XHRcdFx0YnJlYWtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0XG5cdH1cblxuXHRleHBvcnRzLnRvQnl0ZUFycmF5ID0gYjY0VG9CeXRlQXJyYXlcblx0ZXhwb3J0cy5mcm9tQnl0ZUFycmF5ID0gdWludDhUb0Jhc2U2NFxufSh0eXBlb2YgZXhwb3J0cyA9PT0gJ3VuZGVmaW5lZCcgPyAodGhpcy5iYXNlNjRqcyA9IHt9KSA6IGV4cG9ydHMpKVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2Jhc2U2NC1qcy9saWJcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5leHBvcnRzLnJlYWQgPSBmdW5jdGlvbihidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIG5CaXRzID0gLTcsXG4gICAgICBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDAsXG4gICAgICBkID0gaXNMRSA/IC0xIDogMSxcbiAgICAgIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV07XG5cbiAgaSArPSBkO1xuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBzID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gZUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIGUgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBtTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBpZiAoZSA9PT0gMCkge1xuICAgIGUgPSAxIC0gZUJpYXM7XG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KTtcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pO1xuICAgIGUgPSBlIC0gZUJpYXM7XG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbik7XG59O1xuXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGMsXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApLFxuICAgICAgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpLFxuICAgICAgZCA9IGlzTEUgPyAxIDogLTEsXG4gICAgICBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwO1xuXG4gIHZhbHVlID0gTWF0aC5hYnModmFsdWUpO1xuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwO1xuICAgIGUgPSBlTWF4O1xuICB9IGVsc2Uge1xuICAgIGUgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKTtcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS07XG4gICAgICBjICo9IDI7XG4gICAgfVxuICAgIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgdmFsdWUgKz0gcnQgLyBjO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcyk7XG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrO1xuICAgICAgYyAvPSAyO1xuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDA7XG4gICAgICBlID0gZU1heDtcbiAgICB9IGVsc2UgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICBtID0gKHZhbHVlICogYyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gZSArIGVCaWFzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gMDtcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KTtcblxuICBlID0gKGUgPDwgbUxlbikgfCBtO1xuICBlTGVuICs9IG1MZW47XG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCk7XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4O1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2llZWU3NTQvaW5kZXguanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2llZWU3NTRcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5wcm9jZXNzLm5leHRUaWNrID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2FuU2V0SW1tZWRpYXRlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGV2LnNvdXJjZTtcbiAgICAgICAgICAgIGlmICgoc291cmNlID09PSB3aW5kb3cgfHwgc291cmNlID09PSBudWxsKSAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBDb250cm9sbGVyID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL2NvbnRyb2xsZXInKTtcbnZhciBNb2RhbFZpZXcgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9hcHAvdmlld3MvYXBwbGljYXRpb24vbW9kYWwnKTtcblxuZnVuY3Rpb24gTW9kYWxDb250cm9sbGVyKCRlbGVtZW50KXtcblxuICAgIHZhciAkd2luZG93ID0gJCh3aW5kb3cpLFxuICAgICAgICAkYm9keSA9ICQoJ2JvZHknKSxcbiAgICAgICAgJGRvY3VtZW50ID0gJChkb2N1bWVudCksXG4gICAgICAgIGluc3RhbmNlID0gTW9kYWxDb250cm9sbGVyLnByb3RvdHlwZS5jcmVhdGUoe1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKlxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB2aWV3IDogTW9kYWxWaWV3KClcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogUmVuZGVyZWQgdmlldy5cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgfSk7XG5cbiAgICAkZWxlbWVudC5hcHBlbmQoaW5zdGFuY2Uudmlldy5yZW5kZXIoKSk7XG4gICAgJGVsZW1lbnQuaGlkZSgpLmNoaWxkcmVuKCkuaGlkZSgpO1xuICAgIGluc3RhbmNlLnZpZXcucm9vdCA9ICRlbGVtZW50O1xuICAgICRib2R5LmFwcGVuZCgkZWxlbWVudCk7XG5cbiAgICBpbnN0YW5jZS5oYW5kbGVycyA9IHtcbiAgICAgICAgY2xvc2UgOiAkZWxlbWVudC5vbignY2xpY2snLCAnLm1vZGFsLW92ZXJsYXksIC5jbG9zZScsIGZ1bmN0aW9uKCl7IGluc3RhbmNlLmNsb3NlKCk7IH0pLFxuICAgICAgICBlc2NhcGUgOiAkZG9jdW1lbnQub24oJ2tleXVwJywgZnVuY3Rpb24oZSl7IGlmIChlLmtleUNvZGUgPT09IDI3KSBpbnN0YW5jZS5jbG9zZSgpOyB9KSxcbiAgICAgICAgcmVzaXplOiAkd2luZG93LmFkZCgkYm9keSkub24oJ3Jlc2l6ZSBzY3JvbGwnLCBfLnRocm90dGxlKGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB2YXIgJHcgPSBpbnN0YW5jZS52aWV3LndpbmRvdztcbiAgICAgICAgICAgICRlbGVtZW50LmNzcyh7XG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiAkd2luZG93LmlubmVyV2lkdGgoKSxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiAkKGRvY3VtZW50KS5pbm5lckhlaWdodCgpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkdy5jc3Moe1xuICAgICAgICAgICAgICAgICdtYXJnaW4tbGVmdCcgOiAtJHcud2lkdGgoKS8yLFxuICAgICAgICAgICAgICAgICdtYXJnaW4tdG9wJyA6IC0kdy5oZWlnaHQoKS8yXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgNTAwKSlcbiAgICB9O1xuXG4gICAgcmV0dXJuIGluc3RhbmNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IENvbnRyb2xsZXIucHJvdG90eXBlLmV4dGVuZCggQ29udHJvbGxlciwgTW9kYWxDb250cm9sbGVyLCB7XG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBwcm9taXNlXG4gICAgICovXG4gICAgY2xvc2UgOiBmdW5jdGlvbigpe1xuICAgICAgICB2YXIgdmlldyA9IHRoaXMudmlldztcbiAgICAgICAgdmFyIGVsZW0gPSB0aGlzLnZpZXcucm9vdDtcbiAgICAgICAgdmFyIHByb21pc2UgPSAkLndoZW4oIHZpZXcud2luZG93LmhpZGUoKS5wcm9taXNlKCksIHZpZXcub3ZlcmxheS5oaWRlKCkucHJvbWlzZSgpICk7XG4gICAgICAgIHJldHVybiBwcm9taXNlLmRvbmUoZnVuY3Rpb24od2luKXtcbiAgICAgICAgICAgIHdpbi5jaGlsZHJlbignLm1vZGFsLWNvbnRlbnRzJykuZW1wdHkoKTtcbiAgICAgICAgICAgIGVsZW0uaGlkZSgpO1xuICAgICAgICB9KTtcbiAgICB9LFxuICAgIC8qKlxuICAgICAqXG4gICAgICogQHJldHVybnMge09iamVjdH0gcHJvbWlzZVxuICAgICAqL1xuICAgIHNob3c6IGZ1bmN0aW9uKGNvbnRlbnQpe1xuICAgICAgICB2YXIgdmlldyA9IHRoaXMudmlldztcbiAgICAgICAgdmFyIHBvcHVwID0gdmlldy53aW5kb3c7XG4gICAgICAgIHRoaXMudmlldy5yb290LnNob3coKTtcblxuICAgICAgICByZXR1cm4gJC53aGVuKCB2aWV3Lm92ZXJsYXkuc2hvdygxMCkucHJvbWlzZSgpICkuZG9uZShmdW5jdGlvbigpe1xuICAgICAgICAgICAgcG9wdXAuY2hpbGRyZW4oJy5tb2RhbC1jb250ZW50cycpLmFwcGVuZChjb250ZW50KTtcbiAgICAgICAgICAgIHBvcHVwLnNob3coKTtcbiAgICAgICAgICAgIHBvcHVwLmNzcyh7XG4gICAgICAgICAgICAgICAgJ21pbi1oZWlnaHQnIDogXCIxcHhcIixcbiAgICAgICAgICAgICAgICAnbWFyZ2luLWxlZnQnIDogLXBvcHVwLndpZHRoKCkvMixcbiAgICAgICAgICAgICAgICAnbWFyZ2luLXRvcCcgOiAtcG9wdXAuaGVpZ2h0KCkvMlxuICAgICAgICAgICAgfSkuaGVpZ2h0KDkwMCk7XG4gICAgICAgIH0pO1xuICAgIH1cbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL2NvbnRyb2xsZXJzL21vZGFsX2NvbnRyb2xsZXIuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL2NvbnRyb2xsZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBDb250cm9sbGVyID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL2NvbnRyb2xsZXInKTtcbnZhciBUYWJsZVZpZXcgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9hcHAvdmlld3Mvb2JzZXJ2YXRpb25zL3RhYmxlJyk7XG4vKipcbiAqXG4gKiBAcGFyYW0ge2pRdWVyeX0gJGVsZW1cbiAqIEByZXR1cm5zIHtPYnNlcnZhdGlvbnNDb250cm9sbGVyfSBpbnN0YW5jZVxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIE9ic2VydmF0aW9uc0NvbnRyb2xsZXIoJGVsZW0pe1xuICAgIHJldHVybiBPYnNlcnZhdGlvbnNDb250cm9sbGVyLnByb3RvdHlwZS5jcmVhdGUoe1xuICAgICAgICBlbGVtZW50OiAkZWxlbVxuICAgIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IENvbnRyb2xsZXIucHJvdG90eXBlLmV4dGVuZChDb250cm9sbGVyLCBPYnNlcnZhdGlvbnNDb250cm9sbGVyLCB7XG4gICAgLyoqXG4gICAgICogR2V0IG9ic2VydmF0aW9ucyBmb3Igc3RhdGlvbi5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHN0YXRpb25JZFxuICAgICAqIEBwYXJhbSB7Vmlld30gdmlldyAtIG9wdGlvbmFsXG4gICAgICogQHJldHVybnMge09iamVjdH0gYSBwcm9taXNlXG4gICAgICovXG4gICAgaW5kZXg6IGZ1bmN0aW9uKHN0YXRpb25JZCwgdmlldyl7XG4gICAgICAgIHZhciBjb250cm9sbGVyID0gdGhpcztcbiAgICAgICAgdmFyIHZpZXcgPSB2aWV3IHx8IFRhYmxlVmlldygpO1xuICAgICAgICB2YXIgcHJvbWlzZSA9ICQud2hlbih0aGlzLmNsaWVudC5nZXRPYnNlcnZhdGlvbnMoc3RhdGlvbklkKSwgdGhpcy5jbGllbnQuZ2V0U3RhdGlvbihzdGF0aW9uSWQpKTtcbiAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihmdW5jdGlvbihvYnNlcnZhdGlvbnMsIHN0YXRpb24pe1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBjb250cm9sbGVyLmVsZW1lbnQsXG4gICAgICAgICAgICAgICAgdmlldzogdmlldyxcbiAgICAgICAgICAgICAgICByZW5kZXJlZDogdmlldy5yZW5kZXIoe1xuICAgICAgICAgICAgICAgICAgICBvYnNlcnZhdGlvbnM6IG9ic2VydmF0aW9ucyxcbiAgICAgICAgICAgICAgICAgICAgc3RhdGlvbjogc3RhdGlvblxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIG9ic2VydmF0aW9uczogb2JzZXJ2YXRpb25zLFxuICAgICAgICAgICAgICAgIHN0YXRpb246IHN0YXRpb25cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkudGhlbihmdW5jdGlvbihzdGF0ZSl7XG4gICAgICAgICAgICBjb250cm9sbGVyLmVsZW1lbnQuZW1wdHkoKTtcbiAgICAgICAgICAgIGNvbnRyb2xsZXIuZWxlbWVudC5hcHBlbmQoc3RhdGUucmVuZGVyZWQpO1xuICAgICAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgICB9KTtcbiAgICB9XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC9jb250cm9sbGVycy9vYnNlcnZhdGlvbnNfY29udHJvbGxlci5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvY29udHJvbGxlcnNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIENvbnRyb2xsZXIgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvY29udHJvbGxlcicpO1xudmFyIE1hcFZpZXcgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9hcHAvdmlld3Mvc3RhdGlvbnMvbWFwJyk7XG5cbi8qKlxuICpcbiAqIEBwYXJhbSB7alF1ZXJ5fSAkZWxlbVxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIFN0YXRpb25zQ29udHJvbGxlcigkZWxlbSl7XG4gICByZXR1cm4gU3RhdGlvbnNDb250cm9sbGVyLnByb3RvdHlwZS5jcmVhdGUoe1xuICAgICAgIGVsZW1lbnQgOiAkZWxlbVxuICAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ29udHJvbGxlci5wcm90b3R5cGUuZXh0ZW5kKENvbnRyb2xsZXIsIFN0YXRpb25zQ29udHJvbGxlciwge1xuICAgIC8qKlxuICAgICAqIFNob3cgYWxsIHN0YXRpb25zXG4gICAgICogQHBhcmFtIHtWaWV3fSB2aWV3XG4gICAgICogQHJldHVybnMge09iamVjdH0gYSBwcm9taXNlXG4gICAgICovXG4gICAgaW5kZXggOiBmdW5jdGlvbih2aWV3KSB7XG4gICAgICAgIHZhciBjb250cm9sbGVyID0gdGhpcztcbiAgICAgICAgdmlldyA9IHZpZXcgfHwgTWFwVmlldygpO1xuICAgICAgICByZXR1cm4gJC53aGVuKHRoaXMuY2xpZW50LmdldFN0YXRpb25zKCkpXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbihzdGF0aW9ucyl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudDogY29udHJvbGxlci5lbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICB2aWV3OiB2aWV3LFxuICAgICAgICAgICAgICAgICAgICByZW5kZXJlZDogdmlldy5yZW5kZXIoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGlvbnM6IHN0YXRpb25zXG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbihzdGF0ZSl7XG4gICAgICAgICAgICAgICAgY29udHJvbGxlci5lbGVtZW50LmVtcHR5KCk7XG4gICAgICAgICAgICAgICAgY29udHJvbGxlci5lbGVtZW50LmFwcGVuZChzdGF0ZS5yZW5kZXJlZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgICAgICAgfSk7XG4gICAgfVxufSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvY29udHJvbGxlcnMvc3RhdGlvbnNfY29udHJvbGxlci5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvY29udHJvbGxlcnNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIE1vZGVsID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL21vZGVsJyk7XG5cbi8qKlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBhdHRyaWJ1dGVzXG4gKiBAcmV0dXJucyB7T2JzZXJ2YXRpb259XG4gKiBAY29uc3RydWN0b3IgZG9lcyBub3QgbmVlZCBuZXcga2V5d29kLlxuICovXG5mdW5jdGlvbiBPYnNlcnZhdGlvbihhdHRyaWJ1dGVzKXtcbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkge1N0cmluZ3xOdW1iZXJ9IGlkXG4gICAgICogQHByb3BlcnR5IHtTdHJpbmd8TnVtYmVyfSBzdGF0aW9uX2lkXG4gICAgICogQHByb3BlcnR5IHtOdW1iZXJ9IHNwZWVkIChtL3MpXG4gICAgICogQHByb3BlcnR5IHtOdW1iZXJ9IGRpcmVjdGlvbiAoZGVncmVlcylcbiAgICAgKiBAcHJvcGVydHkge051bWJlcn0gbWF4IChtL3MpXG4gICAgICogQHByb3BlcnR5IHtOdW1iZXJ9IG1pbiAobS9zKVxuICAgICAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBjcmVhdGVkX2F0IC0gSVNPIDg2MDEgY3JlYXRlZCBhdCBkYXRlIGluIHN0YXRpb24gbG9jYWwgdGltZVxuICAgICAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBjYXJkaW5hbFxuICAgICAqIEBwcm9wZXJ0eSB7U3RyaW5nfSB0c3RhbXAgLSBjcmVhdGVkX2F0IGFzIGEgVVRDIHVuaXggdGltZXN0YW1wXG4gICAgICovXG4gICAgaWYgKGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgYXR0cmlidXRlcyA9IF8uZXh0ZW5kKGF0dHJpYnV0ZXMsIHtcbiAgICAgICAgICAgIGRhdGU6IG5ldyBEYXRlKGF0dHJpYnV0ZXNbXCJ0c3RhbXBcIl0gKiAxMDAwKSxcbiAgICAgICAgICAgIG1heDogYXR0cmlidXRlc1tcIm1heF93aW5kX3NwZWVkXCJdLFxuICAgICAgICAgICAgbWluOiBhdHRyaWJ1dGVzW1wibWluX3dpbmRfc3BlZWRcIl1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIE9ic2VydmF0aW9uLnByb3RvdHlwZS5jcmVhdGUoYXR0cmlidXRlcyk7XG59XG5cbk1vZGVsLnByb3RvdHlwZS5leHRlbmQoTW9kZWwsIE9ic2VydmF0aW9uLCB7XG4gICAgLyoqXG4gICAgICogRm9ybWF0IGNyZWF0ZWQgYXQgZGF0ZSB3aXRoIGNsaWVudHMgbG9jYWxpemF0aW9uIHNldHRpbmdzXG4gICAgICogQHBhcmFtIHtBcnJheX0gbG9jYWxlc1xuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICovXG4gICAgZGF0ZVRpbWUgOiBmdW5jdGlvbihsb2NhbGVzKXtcbiAgICAgICAgLy8gRGF0ZSB0YWtlcyBVVEMgbWlsbGlzZWNvbmRzXG4gICAgICAgIGlmICh0aGlzLmRhdGUpIHJldHVybiB0aGlzLmRhdGUudG9Mb2NhbGVTdHJpbmcobG9jYWxlcyk7XG4gICAgfSxcbiAgICAvKipcbiAgICAgKiBIZWxwZXIgbWV0aG9kIHRoYXQgZm9ybWF0cyB3aW5kIHNwZWVkIGFjY29yZGluZyB0byBgYXZnIChtaW4tbWF4KWBcbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqL1xuICAgIHdpbmRTcGVlZCA6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiBfLnRlbXBsYXRlKCc8JT0gc3BlZWQgJT4mdGhpbnNwOyg8JT0gbWluICU+LTwlPSBtYXggJT4pIG1zJywgdGhpcyk7XG4gICAgfSxcbiAgICAvKipcbiAgICAgKiBIZWxwZXIgbWV0aG9kIHRoYXQgb3V0cHV0cyBjb21wYXNzIGRpcmVjdGlvbiBhbmQgZGVncmVlc1xuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgICovXG4gICAgZGVncmVlc0FuZENhcmRpbmFsIDogZnVuY3Rpb24oKXtcbiAgICAgICAgcmV0dXJuIF8udGVtcGxhdGUoJzwlPSBjYXJkaW5hbCAlPiZ0aGluc3A7KDwlPSBkaXJlY3Rpb24gJT7CsCknLCB0aGlzKTtcbiAgICB9XG59KTtcbm1vZHVsZS5leHBvcnRzID0gT2JzZXJ2YXRpb247XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvbW9kZWxzL29ic2VydmF0aW9uLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC9tb2RlbHNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIE1vZGVsID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL21vZGVsJyk7XG52YXIgT2JzZXJ2YXRpb24gPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9hcHAvbW9kZWxzL29ic2VydmF0aW9uJyk7XG4vKipcbiAqIEBjb25zdHJ1Y3RvciBkb2VzIG5vdCByZXF1aXJlIHVzZSBvZiBgbmV3YCBrZXl3b3JkLlxuICovXG5mdW5jdGlvbiBTdGF0aW9uKGF0dHJpYnV0ZXMpe1xuICAgIGlmIChhdHRyaWJ1dGVzKSB7XG4gICAgICAgIGF0dHJpYnV0ZXMgPV8uZXh0ZW5kKGF0dHJpYnV0ZXMsIHtcbiAgICAgICAgICAgIGxhdGVzdE9ic2VydmF0aW9uOiBhdHRyaWJ1dGVzW1wibGF0ZXN0X29ic2VydmF0aW9uXCJdID8gT2JzZXJ2YXRpb24oYXR0cmlidXRlc1tcImxhdGVzdF9vYnNlcnZhdGlvblwiXVtcIm9ic2VydmF0aW9uXCJdKSA6IG51bGxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8vIFwic3VwZXJcIiBjb25zdHJ1Y3RvciBjYWxsXG4gICAgcmV0dXJuIFN0YXRpb24ucHJvdG90eXBlLmNyZWF0ZShhdHRyaWJ1dGVzKTtcbn1cblxuTW9kZWwucHJvdG90eXBlLmV4dGVuZChNb2RlbCwgU3RhdGlvbiwge1xuICAgIC8qKlxuICAgICAqIE92ZXJyaWRlcyBPYmplY3QudG9TdHJpbmcgbWV0aG9kIHRvIG91dHB1dCB0aGUgbmFtZSBvZiB0aGUgc3RhdGlvblxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICovXG4gICAgdG9TdHJpbmcgOiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMub2ZmbGluZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubmFtZSArICcgPGJyPiAnICsgJ09mZmxpbmUnXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5sYXRlc3RPYnNlcnZhdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubmFtZSArICcgPGJyPiAnICsgdGhpcy5sYXRlc3RPYnNlcnZhdGlvbi53aW5kU3BlZWQoKTtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xubW9kdWxlLmV4cG9ydHMgPSBTdGF0aW9uO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL21vZGVscy9zdGF0aW9uLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC9tb2RlbHNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIFZpZXcgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvdmlldycpO1xuXG4vKipcbiAqXG4gKiBAcmV0dXJucyB7TW9kYWxWaWV3fVxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIE1vZGFsVmlldygpe1xuICAgIHJldHVybiBNb2RhbFZpZXcucHJvdG90eXBlLmNyZWF0ZSh7XG4gICAgICAgIHRlbXBsYXRlIDogXy50ZW1wbGF0ZShcbiAgICAgICAgICAgICc8ZGl2IGNsYXNzPVwibW9kYWwtb3ZlcmxheVwiPjwvZGl2PicrXG4gICAgICAgICAgICAnPGRpdiBjbGFzcz1cIm1vZGFsLXdpbmRvd1wiPicgK1xuICAgICAgICAgICAgICAgICc8ZGl2IGNsYXNzPVwibW9kYWwtY29udGVudHNcIj48L2Rpdj4nICtcbiAgICAgICAgICAgICAgICAnPGJ1dHRvbiBjbGFzcz1cImNsb3NlXCI+PCU9IHRoaXMudHJhbnMuY2xvc2UgJT48L2J1dHRvbj4nICtcbiAgICAgICAgICAgICc8L2Rpdj4nXG4gICAgICAgICksXG4gICAgICAgIGRlZmF1bHRUcmFuc2xhdGlvbnMgOiB7XG4gICAgICAgICAgICBjbG9zZTogXCJDbG9zZVwiXG4gICAgICAgIH0sXG4gICAgICAgIGFmdGVyUmVuZGVyIDogZnVuY3Rpb24ocmVuZGVyZWQpIHtcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudCA9IHJlbmRlcmVkO1xuICAgICAgICAgICAgdGhpcy53aW5kb3cgPSByZW5kZXJlZC5maWx0ZXIoJy5tb2RhbC13aW5kb3cnKS5oaWRlKCk7XG4gICAgICAgICAgICB0aGlzLm92ZXJsYXkgPSByZW5kZXJlZC5maWx0ZXIoJy5tb2RhbC1vdmVybGF5JykuaGlkZSgpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gVmlldy5wcm90b3R5cGUuZXh0ZW5kKFZpZXcsIE1vZGFsVmlldyk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvdmlld3MvYXBwbGljYXRpb24vbW9kYWwuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL3ZpZXdzL2FwcGxpY2F0aW9uXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBWaWV3ID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL3ZpZXcnKTtcbi8qKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBUYWJsZVZpZXcob3B0aW9ucyl7XG4gICAgb3B0aW9ucyA9IF8uZGVmYXVsdHMob3B0aW9ucyB8fCB7fSwge1xuICAgICAgICBwZXJfcGFnZTogMjBcbiAgICB9KTtcbiAgICAvKipcbiAgICAgKiBCaW5kIGV2ZW50IGhhbmRsZXJzIGZvciBwYWdpbmF0aW9uXG4gICAgICogQHBhcmFtIHtqUXVlcnl9IHRlbXBsYXRlXG4gICAgICogQHJldHVybnMge2pRdWVyeX1cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBwYWdpbmF0ZSh0ZW1wbGF0ZSwgb3B0aW9ucykge1xuICAgICAgICB2YXIgb2JzZXJ2YXRpb25zID0gdGVtcGxhdGUuZmluZCgnLm9ic2VydmF0aW9uJyk7XG4gICAgICAgIHZhciBwYWdpbmF0aW9uID0gdGVtcGxhdGUuZmluZCgnLnBhZ2luYXRpb24nKTtcbiAgICAgICAgdmFyIHBlcl9wYWdlID0gb3B0aW9ucy5wZXJfcGFnZTtcblxuICAgICAgICAvLyBhZGQgcGFnZSBjbGFzc2VzXG4gICAgICAgIG9ic2VydmF0aW9ucy5lYWNoKGZ1bmN0aW9uKGkpe1xuICAgICAgICAgICAgJCh0aGlzKS5hZGRDbGFzcygncGFnZS0nICsgTWF0aC5mbG9vcihpL3Blcl9wYWdlICsgMSkpO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gTWFyayBmaXJzdCBwYWdlIGFzIGFjdGl2ZVxuICAgICAgICB0ZW1wbGF0ZS5maW5kKCcucGFnaW5hdGlvbiBsaTpmaXJzdCcpLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgdGVtcGxhdGUuZmluZCgnLm9ic2VydmF0aW9uOm5vdCgucGFnZS0xKScpLmFkZENsYXNzKCdoaWRkZW4nKTtcblxuICAgICAgICAvLyB3aGVuIGNsaWNraW5nIGEgcGFnZSBudW1iZXJcbiAgICAgICAgcGFnaW5hdGlvbi5vbignY2xpY2snLCAnLnBhZ2UnLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdmFyIG9uX3BhZ2UgPSAkKHRoaXMpLmF0dHIoJ2hyZWYnKS5yZXBsYWNlKCcjJywgJy4nKTtcbiAgICAgICAgICAgIHBhZ2luYXRpb24uZmluZCgnbGknKS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICAkKHRoaXMpLnBhcmVudCgpLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgIG9ic2VydmF0aW9ucy5maWx0ZXIob25fcGFnZSkucmVtb3ZlQ2xhc3MoJ2hpZGRlbicpO1xuICAgICAgICAgICAgb2JzZXJ2YXRpb25zLm5vdChvbl9wYWdlKS5hZGRDbGFzcygnaGlkZGVuJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGVtcGxhdGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIFRhYmxlVmlldy5wcm90b3R5cGUuY3JlYXRlKHtcbiAgICAgICAgb3B0aW9uczogb3B0aW9ucyxcbiAgICAgICAgcmVuZGVyOiBmdW5jdGlvbih2aWV3X2RhdGEpe1xuICAgICAgICAgICAgdmFyIHBlcl9wYWdlID0gdGhpcy5vcHRpb25zLnBlcl9wYWdlO1xuICAgICAgICAgICAgdmlld19kYXRhID0gXy5kZWZhdWx0cyh2aWV3X2RhdGEsIHtcbiAgICAgICAgICAgICAgICBwZXJfcGFnZTogcGVyX3BhZ2UsXG4gICAgICAgICAgICAgICAgcGFnZXM6IE1hdGguY2VpbCh2aWV3X2RhdGEub2JzZXJ2YXRpb25zLmxlbmd0aCAvIHBlcl9wYWdlKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gcGFnaW5hdGUoIFRhYmxlVmlldy5wcm90b3R5cGUucmVuZGVyKHZpZXdfZGF0YSksIG9wdGlvbnMgKVxuICAgICAgICB9XG4gICAgfSlcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBWaWV3LnByb3RvdHlwZS5leHRlbmQoVmlldywgVGFibGVWaWV3LCB7XG4gICAgZGVmYXVsdFRyYW5zbGF0aW9uczoge1xuICAgICAgICBjcmVhdGVkX2F0OiAnVGltZScsXG4gICAgICAgIHNwZWVkOiAnV2luZCBzcGVlZCcsXG4gICAgICAgIGRpcmVjdGlvbjogJ0RpcmVjdGlvbidcbiAgICB9LFxuICAgIHRlbXBsYXRlOiBfLnRlbXBsYXRlKFxuICAgICAgICAnPHRhYmxlPicgK1xuICAgICAgICAgICAgJzxsZWdlbmQgY2xhc3M9XCJzdGF0aW9uLW5hbWVcIj48JT0gdGhpcy5zdGF0aW9uLm5hbWUgJT48L2xlZ2VuZD4nICtcbiAgICAgICAgICAgICc8dGhlYWQ+JyArXG4gICAgICAgICAgICAgICAgJzx0cj4nICtcbiAgICAgICAgICAgICAgICAgICAgJzx0ZD48JT0gdC5jcmVhdGVkX2F0ICU+PC90ZD4nICtcbiAgICAgICAgICAgICAgICAgICAgJzx0ZD48JT0gdC5zcGVlZCAlPjwvdGQ+JyArXG4gICAgICAgICAgICAgICAgICAgICc8dGQ+PCU9IHQuZGlyZWN0aW9uICU+PC90ZD4nICtcbiAgICAgICAgICAgICAgICAnPC90cj4nICtcbiAgICAgICAgICAgICc8L3RoZWFkPicgK1xuICAgICAgICAgICAgJzx0Ym9keT4nICtcbiAgICAgICAgICAgICAgICAnPCUgXy5lYWNoKHRoaXMub2JzZXJ2YXRpb25zLCBmdW5jdGlvbihvYnMsIGluZGV4KSB7ICU+JyArXG4gICAgICAgICAgICAgICAgJzx0ciBjbGFzcz1cIm9ic2VydmF0aW9uXCIgPicgK1xuICAgICAgICAgICAgICAgICAgICBcIjx0ZCBjbGFzcz0nY3JlYXRlZC1hdCc+PCU9IG9icy5kYXRlVGltZSgpICU+PC90ZD5cIiArXG4gICAgICAgICAgICAgICAgICAgIFwiPHRkIGNsYXNzPSd3aW5kLXNwZWVkJz48JT0gb2JzLndpbmRTcGVlZCgpICU+PC90ZD5cIiArXG4gICAgICAgICAgICAgICAgICAgIFwiPHRkIGNsYXNzPSdkaXJlY3Rpb24nPjwlPSBvYnMuZGVncmVlc0FuZENhcmRpbmFsKCkgJT48L3RkPlwiICtcbiAgICAgICAgICAgICAgICAnPC90cj4nK1xuICAgICAgICAgICAgICAgICc8JSB9KTsgJT4nICtcbiAgICAgICAgICAgICc8L3Rib2R5PicgK1xuICAgICAgICAnPC90YWJsZT4nICtcbiAgICAgICAgJzxuYXYgY2xhc3M9XCJwYWdlc1wiPicgK1xuICAgICAgICAgICAgJzx1bCBjbGFzcz1cInBhZ2luYXRpb25cIj4nICtcbiAgICAgICAgICAgICc8JSBfLnRpbWVzKHRoaXMucGFnZXMsIGZ1bmN0aW9uKHBhZ2UpeyBwYWdlKys7ICU+JyArXG4gICAgICAgICAgICAgICAgJzxsaT48YSBjbGFzcz1cInBhZ2VcIiBocmVmPVwiI3BhZ2UtPCU9IHBhZ2UgJT5cIj48JT0gcGFnZSAlPjwvYT48L2xpPicgK1xuICAgICAgICAgICAgJzwlIH0pOyAlPicgK1xuICAgICAgICAgICAgJzwvdWw+JyArXG4gICAgICAgICc8L25hdj4nXG4gICAgKVxufSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvdmlld3Mvb2JzZXJ2YXRpb25zL3RhYmxlLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC92aWV3cy9vYnNlcnZhdGlvbnNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIFZpZXcgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvdmlldycpO1xuXG4vKipcbiAqIEByZXR1cm5zIHtNYXBWaWV3fVxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIE1hcFZpZXcoZ29vZ2xlKXtcbiAgICByZXR1cm4gTWFwVmlldy5wcm90b3R5cGUuY3JlYXRlKGZ1bmN0aW9uKGluc3RhbmNlKXtcbiAgICAgICAgaWYgKGdvb2dsZSkge1xuICAgICAgICAgICAgaW5zdGFuY2UuZ21hcHMgPSBnb29nbGUubWFwcztcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFZpZXcucHJvdG90eXBlLmV4dGVuZChWaWV3LCBNYXBWaWV3LCB7XG4gICAgZGVmYXVsdFRyYW5zbGF0aW9ucyA6IHtcbiAgICAgICAgc2hvd19hbGwgOiBcIlNob3cgYWxsXCJcbiAgICB9LFxuICAgIHNldEdtYXBzIDogZnVuY3Rpb24oZ29vZ2xlX21hcHMpe1xuICAgICAgdGhpcy5nbWFwcyA9IGdvb2dsZV9tYXBzO1xuICAgIH0sXG4gICAgLyoqXG4gICAgICogQHR5cGUge0Z1bmN0aW9ufVxuICAgICAqL1xuICAgIHRlbXBsYXRlIDogXy50ZW1wbGF0ZShcbiAgICAgICAgJzxkaXYgY2xhc3M9XCJjb250cm9sc1wiPicgK1xuICAgICAgICAgICAgJzxidXR0b24gY2xhc3M9XCJ0aW55XCIgaWQ9XCJzaG93LWFsbC1tYXJrZXJzXCI+PCU9IHQuc2hvd19hbGwgJT48L2J1dHRvbj4nICtcbiAgICAgICAgJzwvZGl2PidcbiAgICApLFxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgZ29vZ2xlLm1hcHMuTWFwXG4gICAgICogQHNlZSBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9tYXBzL2RvY3VtZW50YXRpb24vamF2YXNjcmlwdC9yZWZlcmVuY2UjTWFwXG4gICAgICogQHBhcmFtIHtIVE1MRWxlbWVudH0gZWxlbWVudFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBtYXBPcHRpb25zIHNlZSBnb29nbGUubWFwcy5NYXBPcHRpb25zIGZvciB2YWxpZCBvcHRpb25zXG4gICAgICoqL1xuICAgIGNyZWF0ZU1hcDogZnVuY3Rpb24oZWxlbWVudCwgbWFwT3B0aW9ucyl7XG4gICAgICAgIHZhciBnbWFwcyA9IGdsb2JhbC5nb29nbGUubWFwcztcblxuICAgICAgICBpZiAoZWxlbWVudC5qcXVlcnkpIHtcbiAgICAgICAgICAgIGVsZW1lbnQgPSBlbGVtZW50WzBdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgZ21hcHMuTWFwKGVsZW1lbnQsIF8uZGVmYXVsdHMobWFwT3B0aW9ucyB8fCB7fSwge1xuICAgICAgICAgICAgY2VudGVyOiBuZXcgZ21hcHMuTGF0TG5nKDYzLjM5OTMxMywgMTMuMDgyMjM2KSxcbiAgICAgICAgICAgIHpvb206IDEwLFxuICAgICAgICAgICAgbWFwVHlwZUlkOiBnbWFwcy5NYXBUeXBlSWQuUk9BRE1BUFxuICAgICAgICB9KSk7XG4gICAgfSxcbiAgICAvKipcbiAgICAgKiBVcGRhdGUgbWFwIHdpdGggbmV3IG1hcmtlcnMuXG4gICAgICogVGhpcyBkZWxldGVzIGFueSBleGlzdGluZyBtYXJrZXJzIGFuZCByZXNldHMgdGhlIGJvdW5kcyBhbmQgem9vbSBvZiB0aGUgbWFwLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gb25DbGljayAtIGNhbGxiYWNrIGZ1bmN0aW9uIHdoZW4gbWFya2VyIGlzIGNsaWNrZWRcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBkYXRhXG4gICAgICovXG4gICAgdXBkYXRlTWFwOiBmdW5jdGlvbiAoZGF0YSwgb25DbGljaykge1xuICAgICAgICB2YXIgbWFwID0gZGF0YS5tYXA7XG4gICAgICAgIHZhciBtYXJrZXJzO1xuICAgICAgICB2YXIgZ21hcHMgPSBnbG9iYWwuZ29vZ2xlLm1hcHM7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIENyZWF0ZXMgYW4gaWNvbiBmb3Igc3RhdGlvbiBkZXBlbmRpbmcgb24gc3RhdGlvbiBzdGF0ZS5cbiAgICAgICAgICogQ2FuIGJlIGVpdGhlciBhIGNyb3NzIGZvciBhbiBvZmZsaW5lIHN0YXRpb24gb3IgYW4gYXJyb3cgZGlzcGxheWluZyB3aW5kIGRpcmVjdGlvbi5cbiAgICAgICAgICogQHBhcmFtIHtTdGF0aW9ufSBzdGF0aW9uXG4gICAgICAgICAqIEByZXR1cm5zIHtNYXBWaWV3Lkljb259XG4gICAgICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAgICAgKi9cbiAgICAgICAgZnVuY3Rpb24gSWNvbihzdGF0aW9uKXtcbiAgICAgICAgICAgIHZhciBjb2xvciwgb2JzZXJ2YXRpb24gPSBzdGF0aW9uLmxhdGVzdE9ic2VydmF0aW9uO1xuICAgICAgICAgICAgdmFyIGJlYXVmb3J0ID0ge1xuICAgICAgICAgICAgICAgIDE6IHtcbiAgICAgICAgICAgICAgICAgICAgbWluOiAwLFxuICAgICAgICAgICAgICAgICAgICBtYXg6IDAuMyxcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6IFwiI0ZGRlwiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAyOiB7XG4gICAgICAgICAgICAgICAgICAgIG1pbjogMC4zLFxuICAgICAgICAgICAgICAgICAgICBtYXg6My41LFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogXCIjQTRGNUNDXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIDM6IHtcbiAgICAgICAgICAgICAgICAgICAgbWluOiAzLjUsXG4gICAgICAgICAgICAgICAgICAgIG1heDogNS41LFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogXCIjOTlGRjk5XCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIDQ6IHtcbiAgICAgICAgICAgICAgICAgICAgbWluOiA1LjUsXG4gICAgICAgICAgICAgICAgICAgIG1heDogNy45LFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogXCIjOTlGRjY2XCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIDU6IHtcbiAgICAgICAgICAgICAgICAgICAgbWluOiA4LjAsXG4gICAgICAgICAgICAgICAgICAgIG1heDogMTAuOCxcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6IFwiIzk5RkYwMFwiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICA2OiB7XG4gICAgICAgICAgICAgICAgICAgIG1pbjogMTAuOCxcbiAgICAgICAgICAgICAgICAgICAgbWF4OiAxMy44LFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogXCIjQ0NGRjAwXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIDc6IHtcbiAgICAgICAgICAgICAgICAgICAgbWluOiAxMy45LFxuICAgICAgICAgICAgICAgICAgICBtYXg6IDE3LjIsXG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiBcIiNGRkZGMDBcIlxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgODoge1xuICAgICAgICAgICAgICAgICAgICBtaW46IDE3LjIsXG4gICAgICAgICAgICAgICAgICAgIG1heDogMjAuOCxcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6IFwiI0ZGQ0MwMFwiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICA5OiB7XG4gICAgICAgICAgICAgICAgICAgIG1pbjogMjAuOCxcbiAgICAgICAgICAgICAgICAgICAgbWF4OiAyNC41LFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogXCIjRkY5OTAwXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIDEwOiB7XG4gICAgICAgICAgICAgICAgICAgIG1pbjogMjQuNSxcbiAgICAgICAgICAgICAgICAgICAgbWF4OiAyOC41LFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogXCIjRkY2NjAwXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIDExOiB7XG4gICAgICAgICAgICAgICAgICAgIG1pbjogMjguNSxcbiAgICAgICAgICAgICAgICAgICAgbWF4OiAzMi43LFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogXCIjRkYzMzAwXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIDEyOiB7XG4gICAgICAgICAgICAgICAgICAgIG1pbjogMzIuNyxcbiAgICAgICAgICAgICAgICAgICAgbWF4OiA5OTksXG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiBcIiNGRjAwMDBcIlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vIERlZmF1bHRzXG4gICAgICAgICAgICBfLmV4dGVuZCh0aGlzLCB7XG4gICAgICAgICAgICAgICAgZmlsbE9wYWNpdHk6IDAuOCxcbiAgICAgICAgICAgICAgICBzdHJva2VDb2xvcjogJ2JsYWNrJyxcbiAgICAgICAgICAgICAgICBzdHJva2VXZWlnaHQ6IDEuMlxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoIXN0YXRpb24ub2ZmbGluZSAmJiBvYnNlcnZhdGlvbikge1xuICAgICAgICAgICAgICAgIGNvbG9yID0gKF8uZmluZChiZWF1Zm9ydCwgZnVuY3Rpb24oYmYpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKG9ic2VydmF0aW9uLnNwZWVkID49IGJmLm1pbiAmJiBvYnNlcnZhdGlvbi5zcGVlZCA8IGJmLm1heCk7XG4gICAgICAgICAgICAgICAgfSkpLmNvbG9yO1xuICAgICAgICAgICAgICAgIF8uZXh0ZW5kKHRoaXMsIHtcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogXCJNMjAsMy4yNzJjMCwwLDEzLjczMSwxMi41MywxMy43MzEsMTkuMTcxUzMxLjEzLDM2LjcyOCwzMS4xMywzNi43MjhTMjMuMzcyLDMxLjUzNiwyMCwzMS41MzYgUzguODcsMzYuNzI4LDguODcsMzYuNzI4cy0yLjYwMS03LjY0NC0yLjYwMS0xNC4yODVTMjAsMy4yNzIsMjAsMy4yNzJ6XCIsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6ICdBcnJvd0ljb24nLFxuICAgICAgICAgICAgICAgICAgICBzaXplOiBuZXcgZ21hcHMuU2l6ZSg0MCwgNDApLFxuICAgICAgICAgICAgICAgICAgICBvcmlnaW46IG5ldyBnbWFwcy5Qb2ludCgyMCwyMCksXG4gICAgICAgICAgICAgICAgICAgIGFuY2hvcjogbmV3IGdtYXBzLlBvaW50KDIwLCAyMCksXG4gICAgICAgICAgICAgICAgICAgIGZpbGxDb2xvcjogY29sb3IgPyBjb2xvciA6ICdyZWQnLFxuICAgICAgICAgICAgICAgICAgICByb3RhdGlvbjogMTgwLjAgKyBvYnNlcnZhdGlvbi5kaXJlY3Rpb25cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgXy5leHRlbmQodGhpcywge1xuICAgICAgICAgICAgICAgICAgICBwYXRoIDogXCJNNDIuMTQzLDM0LjA1NUwzMC42MTEsMjIuNTIzbDExLjUzMS0xMS41MzFjLTEuODI4LTIuOTgzLTQuMzQ0LTUuNDk5LTcuMzI3LTcuMzI3TDIzLjI4NCwxNS4xOTdMMTEuNzUzLDMuNjY1IEM4Ljc3LDUuNDkzLDYuMjU0LDguMDA5LDQuNDI2LDEwLjk5MmwxMS41MzEsMTEuNTMxTDQuNDI2LDM0LjA1NWMxLjgyOCwyLjk4Myw0LjM0NCw1LjQ5OSw3LjMyNyw3LjMyN0wyMy4yODQsMjkuODVsMTEuNTMxLDExLjUzMSBDMzcuNzk5LDM5LjU1NCw0MC4zMTUsMzcuMDM4LDQyLjE0MywzNC4wNTV6XCIsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6ICdPZmZsaW5lSWNvbicsXG4gICAgICAgICAgICAgICAgICAgIHNpemU6IG5ldyBnbWFwcy5TaXplKDI1LCAyNSksXG4gICAgICAgICAgICAgICAgICAgIG9yaWdpbjogbmV3IGdtYXBzLlBvaW50KDIwLCAyMCksXG4gICAgICAgICAgICAgICAgICAgIGFuY2hvcjogbmV3IGdtYXBzLlBvaW50KDIzLCAyMyksXG4gICAgICAgICAgICAgICAgICAgIGZpbGxDb2xvcjogJ3doaXRlJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogT3ZlcmxheSBsYWJlbCB1c2VkIHRvIGRpc3BsYXkgc3RhdGlvbiBuYW1lIGFuZCB3aW5kIHNwZWVkIG9uIG1hcFxuICAgICAgICAgKiBkZXJpdmVkIGZyb20gZ29vZ2xlLm1hcHMuT3ZlcmxheVZpZXdcbiAgICAgICAgICogQHNlZSBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9tYXBzL2RvY3VtZW50YXRpb24vamF2YXNjcmlwdC9yZWZlcmVuY2UjT3ZlcmxheVZpZXdcbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IG9wdF9vcHRpb25zXG4gICAgICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAgICAgKi9cbiAgICAgICAgZnVuY3Rpb24gTGFiZWwob3B0X29wdGlvbnMpe1xuICAgICAgICAgICAgLy8gSW5pdGlhbGl6YXRpb25cbiAgICAgICAgICAgIHRoaXMuc2V0VmFsdWVzKG9wdF9vcHRpb25zKTtcbiAgICAgICAgICAgIC8vIExhYmVsIHNwZWNpZmljXG4gICAgICAgICAgICB0aGlzLnNwYW5fID0gJCgnPHNwYW4gY2xhc3M9XCJtYXAtbGFiZWwtaW5uZXJcIj4nKVswXTtcbiAgICAgICAgICAgIHRoaXMuZGl2XyA9ICQoJzxkaXYgY2xhc3M9XCJtYXAtbGFiZWwtb3V0ZXJcIiBzdHlsZT1cInBvc2l0aW9uOiBhYnNvbHV0ZTsgZGlzcGxheTogbm9uZVwiPicpWzBdO1xuICAgICAgICAgICAgdGhpcy5kaXZfLmFwcGVuZENoaWxkKHRoaXMuc3Bhbl8pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9ub2luc3BlY3Rpb24gSlNVbnVzZWRHbG9iYWxTeW1ib2xzXG4gICAgICAgIExhYmVsLnByb3RvdHlwZSA9IF8uZXh0ZW5kKG5ldyBnb29nbGUubWFwcy5PdmVybGF5Vmlldywge1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBJbXBsZW1lbnQgdGhpcyBtZXRob2QgdG8gaW5pdGlhbGl6ZSB0aGUgb3ZlcmxheSBET00gZWxlbWVudHMuXG4gICAgICAgICAgICAgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgb25jZSBhZnRlciBzZXRNYXAoKSBpcyBjYWxsZWQgd2l0aCBhIHZhbGlkIG1hcC5cbiAgICAgICAgICAgICAqIEF0IHRoaXMgcG9pbnQsIHBhbmVzIGFuZCBwcm9qZWN0aW9uIHdpbGwgaGF2ZSBiZWVuIGluaXRpYWxpemVkLlxuICAgICAgICAgICAgICogQHJldHVybnMge3ZvaWR9XG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIG9uQWRkIDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICB2YXIgbGFiZWwgPSB0aGlzO1xuICAgICAgICAgICAgICAgIHRoaXMuZ2V0UGFuZXMoKS5vdmVybGF5TGF5ZXIuYXBwZW5kQ2hpbGQodGhpcy5kaXZfKTtcbiAgICAgICAgICAgICAgICAvLyBFbnN1cmVzIHRoZSBsYWJlbCBpcyByZWRyYXduIGlmIHRoZSB0ZXh0IG9yIHBvc2l0aW9uIGlzIGNoYW5nZWQuXG4gICAgICAgICAgICAgICAgLy9ub2luc3BlY3Rpb24gSlNVbnVzZWRHbG9iYWxTeW1ib2xzXG4gICAgICAgICAgICAgICAgdGhpcy5saXN0ZW5lcnNfID0gXy5tYXAoWydwb3NpdGlvbl9jaGFuZ2VkJywgJ3RleHRfY2hhbmdlZCddLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBnbWFwcy5ldmVudC5hZGRMaXN0ZW5lcih0aGlzLCBldmVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKCkgeyBsYWJlbC5kcmF3KCk7IH0pXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBJbXBsZW1lbnQgdGhpcyBtZXRob2QgdG8gcmVtb3ZlIHlvdXIgZWxlbWVudHMgZnJvbSB0aGUgRE9NLlxuICAgICAgICAgICAgICogVGhpcyBtZXRob2QgaXMgY2FsbGVkIG9uY2UgZm9sbG93aW5nIGEgY2FsbCB0byBzZXRNYXAobnVsbCkuXG4gICAgICAgICAgICAgKiBAcmV0dXJucyB7dm9pZH1cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgb25SZW1vdmUgOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRpdl8ucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLmRpdl8pO1xuICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBhbGwgbGlzdGVuZXJzXG4gICAgICAgICAgICAgICAgLy9ub2luc3BlY3Rpb24gSlNVbnVzZWRHbG9iYWxTeW1ib2xzXG4gICAgICAgICAgICAgICAgdGhpcy5saXN0ZW5lcnNfID0gXy5maWx0ZXIoZnVuY3Rpb24obGlzdGVuZXIpe1xuICAgICAgICAgICAgICAgICAgICBnbWFwcy5ldmVudC5yZW1vdmVMaXN0ZW5lcihsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEltcGxlbWVudCB0aGlzIG1ldGhvZCB0byBkcmF3IG9yIHVwZGF0ZSB0aGUgb3ZlcmxheS5cbiAgICAgICAgICAgICAqIFRoaXMgbWV0aG9kIGlzIGNhbGxlZCBhZnRlciBvbkFkZCgpIGFuZCB3aGVuIHRoZSBwb3NpdGlvbiBmcm9tIHByb2plY3Rpb24uZnJvbUxhdExuZ1RvUGl4ZWwoKVxuICAgICAgICAgICAgICogd291bGQgcmV0dXJuIGEgbmV3IHZhbHVlIGZvciBhIGdpdmVuIExhdExuZy4gVGhpcyBjYW4gaGFwcGVuIG9uIGNoYW5nZSBvZiB6b29tLCBjZW50ZXIsIG9yIG1hcCB0eXBlLlxuICAgICAgICAgICAgICogSXQgaXMgbm90IG5lY2Vzc2FyaWx5IGNhbGxlZCBvbiBkcmFnIG9yIHJlc2l6ZS5cbiAgICAgICAgICAgICAqIEByZXR1cm5zIHt2b2lkfVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBkcmF3IDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBvc2l0aW9uID0gdGhpcy5nZXRQcm9qZWN0aW9uKCkuZnJvbUxhdExuZ1RvRGl2UGl4ZWwodGhpcy5nZXQoJ3Bvc2l0aW9uJykpO1xuICAgICAgICAgICAgICAgIHRoaXMuc3Bhbl8uaW5uZXJIVE1MID0gdGhpcy5nZXQoJ3RleHQnKTtcbiAgICAgICAgICAgICAgICAkKHRoaXMuZGl2XykuY3NzKHtcbiAgICAgICAgICAgICAgICAgICAgbGVmdCA6IHBvc2l0aW9uLnggKyAncHgnLFxuICAgICAgICAgICAgICAgICAgICB0b3A6IHBvc2l0aW9uLnkgKyAncHgnLFxuICAgICAgICAgICAgICAgICAgICBkaXNwbGF5IDogJ2Jsb2NrJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDcmVhdGUgYSBmcmVzaCBib3VuZHMgb2JqZWN0XG4gICAgICAgIG1hcC5ib3VuZHMgPSBuZXcgZ29vZ2xlLm1hcHMuTGF0TG5nQm91bmRzKCk7XG4gICAgICAgIC8vIERlbGV0ZSBhbnkgZXhpc3RpbmcgbWFya2VycyB0byBhdm9pZCBkdXBsaWNhdGVzXG4gICAgICAgIGlmIChfLmlzQXJyYXkoZGF0YS5tYXJrZXJzKSkge1xuICAgICAgICAgICAgZGF0YS5tYXJrZXJzID0gXy5maWx0ZXIoZGF0YS5tYXJrZXJzLCBmdW5jdGlvbihtYXJrZXIpe1xuICAgICAgICAgICAgICAgIG1hcmtlci5zZXRNYXAobnVsbCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgbWFya2VycyA9IF8ubWFwKGRhdGEuc3RhdGlvbnMsIGZ1bmN0aW9uKHN0YXRpb24pe1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBnbWFwcy5NYXJrZXIoe1xuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgZ21hcHMuTGF0TG5nKHN0YXRpb24ubGF0aXR1ZGUsIHN0YXRpb24ubG9uZ2l0dWRlKSxcbiAgICAgICAgICAgICAgICB0aXRsZTogc3RhdGlvbi5uYW1lLFxuICAgICAgICAgICAgICAgIG1hcDogbWFwLFxuICAgICAgICAgICAgICAgIGljb246IG5ldyBJY29uKHN0YXRpb24pLFxuICAgICAgICAgICAgICAgIGlkOiBzdGF0aW9uLmlkLFxuICAgICAgICAgICAgICAgIHN0YXRpb246IHN0YXRpb24sXG4gICAgICAgICAgICAgICAgbGFiZWw6IG5ldyBMYWJlbCh7XG4gICAgICAgICAgICAgICAgICAgIG1hcDogbWFwLFxuICAgICAgICAgICAgICAgICAgICB0ZXh0OiBzdGF0aW9uLnRvU3RyaW5nKClcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBTSURFIEVGRkVDVFMhISEhIVxuICAgICAgICBfLmVhY2gobWFya2VycywgZnVuY3Rpb24obWFya2VyKXtcbiAgICAgICAgICAgIG1hcC5ib3VuZHMuZXh0ZW5kKG1hcmtlci5wb3NpdGlvbik7XG4gICAgICAgICAgICBtYXJrZXIubGFiZWwuYmluZFRvKCdwb3NpdGlvbicsIG1hcmtlciwgJ3Bvc2l0aW9uJyk7XG4gICAgICAgICAgICBpZiAob25DbGljaykge1xuICAgICAgICAgICAgICAgIGdvb2dsZS5tYXBzLmV2ZW50LmFkZExpc3RlbmVyKG1hcmtlciwgJ2NsaWNrJywgb25DbGljayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBtYXAuZml0Qm91bmRzKG1hcC5ib3VuZHMpO1xuICAgICAgICByZXR1cm4gXy5leHRlbmQoZGF0YSwge1xuICAgICAgICAgICAgbWFya2VyczogbWFya2Vyc1xuICAgICAgICB9KTtcbiAgICB9XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC92aWV3cy9zdGF0aW9ucy9tYXAuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL3ZpZXdzL3N0YXRpb25zXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBXaWRnZXQgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvd2lkZ2V0Jyk7XG52YXIgU3RhdGlvbnNDb250cm9sbGVyID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvYXBwL2NvbnRyb2xsZXJzL3N0YXRpb25zX2NvbnRyb2xsZXInKTtcbnZhciBNYXBWaWV3ID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvYXBwL3ZpZXdzL3N0YXRpb25zL21hcCcpO1xuXG4vKipcbiAqIFdpZGdldCB0aGF0IGRpc3BsYXlzIHdpbmQgb2JzZXJ2YXRpb25zIGluIHJldmVyc2UgY2hyb25vbG9naWNhbCBvcmRlclxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIE1hcFdpZGdldChhdHRycyl7XG4gICAgcmV0dXJuIE1hcFdpZGdldC5wcm90b3R5cGUuY3JlYXRlKGF0dHJzIHx8IHt9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBXaWRnZXQucHJvdG90eXBlLmV4dGVuZChXaWRnZXQsIE1hcFdpZGdldCwge1xuICAgIG5hbWU6IFwiTWFwV2lkZ2V0XCIsXG4gICAgc2VsZWN0b3I6ICcubWFwLXdpZGdldCcsXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtqUXVlcnl9ICRlbGVtXG4gICAgICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSBzdGF0aW9uSWRcbiAgICAgKiBAcmV0dXJucyB7VGFibGVXaWRnZXR9XG4gICAgICovXG4gICAgc3RhcnRVcDogZnVuY3Rpb24oJGVsZW0sIHN0YXRpb25JZCl7XG4gICAgICAgIHZhciBjb250cm9sbGVyID0gU3RhdGlvbnNDb250cm9sbGVyKCRlbGVtKTtcbiAgICAgICAgdmFyIHByb21pc2U7XG4gICAgICAgIHZhciBhcGlMb2FkZWQgPSBqUXVlcnkuRGVmZXJyZWQoKTtcbiAgICAgICAgalF1ZXJ5LmdldFNjcmlwdCgnaHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS9qc2FwaScsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBnb29nbGUubG9hZCgnbWFwcycsICczJywgeyBvdGhlcl9wYXJhbXM6ICdzZW5zb3I9ZmFsc2UnLCBjYWxsYmFjazogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICBhcGlMb2FkZWQucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfX0pO1xuICAgICAgICB9KTtcbiAgICAgICAgcHJvbWlzZSA9ICQud2hlbihcbiAgICAgICAgICAgIGFwaUxvYWRlZCxcbiAgICAgICAgICAgIGNvbnRyb2xsZXIuaW5kZXgoTWFwVmlldygpKVxuICAgICAgICApO1xuICAgICAgICBwcm9taXNlLmRvbmUoZnVuY3Rpb24oYXBpLCBzdGF0ZSl7XG4gICAgICAgICAgICB2YXIgdmlldyA9IHN0YXRlLnZpZXc7XG4gICAgICAgICAgICBzdGF0ZS5tYXAgPSB2aWV3LmNyZWF0ZU1hcChzdGF0ZS5lbGVtZW50KTtcbiAgICAgICAgICAgIHZpZXcudXBkYXRlTWFwKHN0YXRlKTtcbiAgICAgICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBNYXBXaWRnZXQoe1xuICAgICAgICAgICAgY29udHJvbGxlciA6IGNvbnRyb2xsZXIsXG4gICAgICAgICAgICBwcm9taXNlIDogcHJvbWlzZVxuICAgICAgICB9KTtcbiAgICB9XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC93aWRnZXRzL21hcF93aWRnZXQuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL3dpZGdldHNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIFdpZGdldCA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2ZyYW1ld29yay93aWRnZXQnKTtcbnZhciBNb2RhbENvbnRyb2xsZXIgPSAgcmVxdWlyZSgnd2luZHRhbGtlcnMvYXBwL2NvbnRyb2xsZXJzL21vZGFsX2NvbnRyb2xsZXInKTtcblxuLyoqXG4gKiBEaXNwbGF5cyBjb250ZW50IGluIGEgXCJwb3B1cFwiIHdpbmRvdy5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBNb2RhbFdpZGdldCgpe1xuICAgIHJldHVybiBNb2RhbFdpZGdldC5wcm90b3R5cGUuY3JlYXRlKGZ1bmN0aW9uKGluc3RhbmNlKXsgLyoqIHByb3BlcnRpZXMgKiovIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFdpZGdldC5wcm90b3R5cGUuZXh0ZW5kKFdpZGdldCwgTW9kYWxXaWRnZXQsIHtcbiAgICBuYW1lOiBcIk1vZGFsV2lkZ2V0XCIsXG4gICAgc2VsZWN0b3I6ICcubW9kYWwtd2lkZ2V0JyxcbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2pRdWVyeX0gJGVsZW1cbiAgICAgKiBAcmV0dXJucyB7TW9kYWxXaWRnZXR9XG4gICAgICovXG4gICAgc3RhcnRVcDogZnVuY3Rpb24oJGVsZW0pe1xuICAgICAgICByZXR1cm4gTW9kYWxXaWRnZXQucHJvdG90eXBlLmNyZWF0ZSh7XG4gICAgICAgICAgICBjb250cm9sbGVyIDogTW9kYWxDb250cm9sbGVyKCRlbGVtKVxuICAgICAgICB9KTtcbiAgICB9XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC93aWRnZXRzL21vZGFsX3dpZGdldC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvd2lkZ2V0c1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgV2lkZ2V0ID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL3dpZGdldCcpO1xudmFyIE9ic2VydmF0aW9uc0NvbnRyb2xsZXIgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9hcHAvY29udHJvbGxlcnMvb2JzZXJ2YXRpb25zX2NvbnRyb2xsZXInKTtcbnZhciBUYWJsZVZpZXcgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9hcHAvdmlld3Mvb2JzZXJ2YXRpb25zL3RhYmxlJyk7XG5cbi8qKlxuICogV2lkZ2V0IHRoYXQgZGlzcGxheXMgd2luZCBvYnNlcnZhdGlvbnMgaW4gcmV2ZXJzZSBjaHJvbm9sb2dpY2FsIG9yZGVyXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gVGFibGVXaWRnZXQoYXR0cnMpe1xuICAgIHJldHVybiBUYWJsZVdpZGdldC5wcm90b3R5cGUuY3JlYXRlKGF0dHJzIHx8IHt9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBXaWRnZXQucHJvdG90eXBlLmV4dGVuZChXaWRnZXQsIFRhYmxlV2lkZ2V0LCB7XG4gICAgbmFtZTogXCJUYWJsZVdpZGdldFwiLFxuICAgIHNlbGVjdG9yOiAnLnRhYmxlLXdpZGdldCcsXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtqUXVlcnl9ICRlbGVtXG4gICAgICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSBzdGF0aW9uSWRcbiAgICAgKiBAcmV0dXJucyB7VGFibGVXaWRnZXR9XG4gICAgICovXG4gICAgc3RhcnRVcDogZnVuY3Rpb24oJGVsZW0sIHN0YXRpb25JZCl7XG4gICAgICAgIHZhciBjb250cm9sbGVyID0gT2JzZXJ2YXRpb25zQ29udHJvbGxlcigkZWxlbSk7XG4gICAgICAgIHN0YXRpb25JZCA9IHN0YXRpb25JZCB8fCAkZWxlbS5kYXRhKCdzdGF0aW9uSWQnKTtcblxuICAgICAgICByZXR1cm4gVGFibGVXaWRnZXQoe1xuICAgICAgICAgICAgY29udHJvbGxlciA6IGNvbnRyb2xsZXIsXG4gICAgICAgICAgICBwcm9taXNlIDogY29udHJvbGxlci5pbmRleChzdGF0aW9uSWQsIFRhYmxlVmlldygpKVxuICAgICAgICB9KTtcbiAgICB9XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC93aWRnZXRzL3RhYmxlX3dpZGdldC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvd2lkZ2V0c1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgU3RhdGlvbiA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2FwcC9tb2RlbHMvc3RhdGlvbicpO1xudmFyIE9ic2VydmF0aW9uID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvYXBwL21vZGVscy9vYnNlcnZhdGlvbicpO1xuLyoqXG4gKiBBUEkgY2xpZW50IHRhbGtzIHRvIHRoZSBibGFzdC5udSBqc29uIHJlc3QgYXBpIHZpYSBhamF4LlxuICogVGhpcyBzaG91bGQgYmUgdGhlIE9ORSBBTkQgT05MWSBwb2ludCBvZiBvdXRzaWRlIGNvbnRhY3QuXG4gKlxuICogQWxsIG1ldGhvZHMgcmV0dXJuIGEgcHJvbWlzZVxuICogKGEgcGxhaW4gamF2YXNjcmlwdCBvYmplY3Qgd2l0aCBoYXMgdGhlIENvbW1vbiBKUyBQcm9taXNlL0EgaW50ZXJmYWNlKVxuICpcbiAqIEBzZWUgaHR0cDovL2FwaS5qcXVlcnkuY29tL1R5cGVzLyNqcVhIUlxuICogQHNlZSBodHRwOi8vd2lraS5jb21tb25qcy5vcmcvd2lraS9Qcm9taXNlc1xuICpcbiAqIFRoZSBBUEkgY2xpZW50IHRha2VzIHRoZSBKU09OIHJlc3BvbnNlIGFuZCBjb252ZXJ0cyB0byBtb2RlbHMgdGhvdWdoIHBpcGluZy5cbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqIEBzZWUgaHR0cDovL3dpa2kuY29tbW9uanMub3JnL3dpa2kvUHJvbWlzZXNcbiAqL1xuZnVuY3Rpb24gQXBpQ2xpZW50KCl7XG4gICAgdmFyIGJhc2VVcmwgPSAnaHR0cDovL3d3dy5ibGFzdC5udSc7XG5cbiAgICAvKipcbiAgICAgKiBHZXQgYWxsIHN0YXRpb25zXG4gICAgICogQHJldHVybnMge09iamVjdH0gYSBQcm9taXNlIG9iamVjdC5cbiAgICAgKi9cbiAgICB0aGlzLmdldFN0YXRpb25zID0gZnVuY3Rpb24oKXtcbiAgICAgICAgcmV0dXJuIGpRdWVyeS5hamF4KHtcbiAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICB1cmw6IGJhc2VVcmwgKyAnL3N0YXRpb25zLmpzb24nXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oZGF0YSl7XG4gICAgICAgICAgICByZXR1cm4gXy5tYXAoZGF0YSwgZnVuY3Rpb24ocyl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFN0YXRpb24ocyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBHZXQgYSBzdGF0aW9uXG4gICAgICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSBpZCBjYW4gZWl0aGVyIGJlIGFuIGlkIG9yIGEgc2x1Z1xuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IGEgUHJvbWlzZSBvYmplY3RcbiAgICAgKi9cbiAgICB0aGlzLmdldFN0YXRpb24gPSBmdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4galF1ZXJ5LmFqYXgoe1xuICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgIHVybDogYmFzZVVybCArICcvc3RhdGlvbnMvJWlkLmpzb24nLnJlcGxhY2UoJyVpZCcsIGlkKVxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKGRhdGEpe1xuICAgICAgICAgICAgcmV0dXJuIFN0YXRpb24oZGF0YSk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogR2V0cyBvYnNlcnZhdGlvbnMgZm9yIGEgZ2l2ZW4gc3RhdGlvbi5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHN0YXRpb25faWQgY2FuIGVpdGhlciBiZSBhbiBpZCBvciBhIHNsdWdcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBhIFByb21pc2Ugb2JqZWN0XG4gICAgICovXG4gICAgdGhpcy5nZXRPYnNlcnZhdGlvbnMgPSBmdW5jdGlvbihzdGF0aW9uX2lkKXtcbiAgICAgICAgcmV0dXJuIGpRdWVyeS5hamF4KHtcbiAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICB1cmw6IGJhc2VVcmwgKyAnL3N0YXRpb25zLyVpZC9vYnNlcnZhdGlvbnMuanNvbicucmVwbGFjZSgnJWlkJywgc3RhdGlvbl9pZClcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbihkYXRhKXtcbiAgICAgICAgICAgIHJldHVybiBfLm1hcChkYXRhLCBmdW5jdGlvbihvYmope1xuICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhdGlvbihvYmopO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQXBpQ2xpZW50O1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrL2FwaV9jbGllbnQuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbi8qKlxuICogQSBzaW1wbGUgc2VydmljZSBjb250YWluZXIgdGhhdCBjb250YWlucyB0aGUgcmVnaXN0ZXJlZCB3aWRnZXRzIGFuZCBoYW5kbGVzIHN0YXJ0dXAgYW5kIHRlYXJkb3duLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBDb250YWluZXIob3B0aW9ucyl7XG4gICAgdGhpcy5vcHRpb25zID0gXy5kZWZhdWx0cyhvcHRpb25zIHx8IHt9LCB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiAgQG9wdGlvbiBjb250ZXh0XG4gICAgICAgICAqICBDYW4gYmUgdXNlZCB0byBsaW1pdCB0aGUgc2NvcGUgdG8gc2VhcmNoIGZvciB3aWRnZXRzIGluLlxuICAgICAgICAgKiAgQWxzbyBjYW4gYmUgdXNlZCB0byBzdHViIGluIGEgZml4dHVyZS5cbiAgICAgICAgICovXG4gICAgICAgIGNvbnRleHQgOiAkKGRvY3VtZW50KSxcbiAgICAgICAgYmFzZVVybDogJ2h0dHA6Ly93d3cuYmxhc3QubnUnXG4gICAgfSk7XG59XG5cbkNvbnRhaW5lci5wcm90b3R5cGUgPSBfLmV4dGVuZChDb250YWluZXIucHJvdG90eXBlLCB7XG4gICAgLyoqXG4gICAgICogVGFrZXMgc2V2ZXJhbCBXaWRnZXRzIGFuZCBjb21iaW5lcyBpbnRvIGFuIG9iamVjdFxuICAgICAqXG4gICAgICogQHBhcmFtIHthcnJheX0gYXJyYXlcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSB0aGUgcmVnaXN0ZXJlZCB3aWRnZXRzXG4gICAgICovXG4gICAgcmVnaXN0ZXIgOiBmdW5jdGlvbihhcnJheSl7XG4gICAgICAgIHJldHVybiBfLm9iamVjdChfLm1hcChhcnJheSxcbiAgICAgICAgICAgIGZ1bmN0aW9uKHdpZGdldCl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LnByb3RvdHlwZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB3aWRnZXRcbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgICkpO1xuICAgIH0sXG4gICAgLyoqXG4gICAgICogTG9vcHMgdGhyb3VnaCB0aGUgd2lkZ2V0IG1hbmlmZXN0cyBhbmQgZmluZHMgbWF0Y2hpbmcgRE9NIGVsZW1lbnRzIGFuZCBjcmVhdGVzIGEgd2lkZ2V0IGluc3RhbmNlIGZvciBlYWNoLlxuICAgICAqIFRoZSBgLnN0YXJ0VXBgIG1ldGhvZCBpcyB0aGVuIGNhbGxlZCBmb3IgZWFjaCB3aWRnZXQgaW5zdGFuY2UuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHdpZGdldHNcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gY29udGV4dFxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgICovXG4gICAgc3RhcnRBbGwgOiBmdW5jdGlvbih3aWRnZXRzLCBjb250ZXh0KXtcbiAgICAgICAgY29udGV4dCA9IGNvbnRleHQgfHwgdGhpcy5vcHRpb25zLmNvbnRleHQ7XG4gICAgICAgIHJldHVybiBfLmVhY2god2lkZ2V0cywgZnVuY3Rpb24od2lkZ2V0KXtcbiAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGNvbnRleHQuZmluZCh3aWRnZXQucHJvdG90eXBlLnNlbGVjdG9yKTtcblxuICAgICAgICAgICAgLy8gTG9vcCB0aHJvdWdoIG1hdGNoaW5nIERPTSBlbGVtZW50c1xuICAgICAgICAgICAgd2lkZ2V0Lmluc3RhbmNlcyA9IF8ubWFwKGVsZW1lbnRzLCBmdW5jdGlvbihlbGVtKXtcbiAgICAgICAgICAgICAgICB2YXIgaW5zdGFuY2UgPSB3aWRnZXQucHJvdG90eXBlLmNyZWF0ZSgpO1xuICAgICAgICAgICAgICAgIGluc3RhbmNlLnN0YXJ0VXAoJChlbGVtKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGluc3RhbmNlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gd2lkZ2V0O1xuICAgICAgICB9KTtcbiAgICB9LFxuICAgIC8qKlxuICAgICAqIFJ1bnMgYWZ0ZXIgYC5zdGFydEFsbGAgYW5kIGNhbGxzIHRoZSB1cGRhdGUgbWV0aG9kIGlmIGF2YWlsYWJsZSBmb3IgZWFjaCB3aWRnZXRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gd2lkZ2V0c1xuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IHRoZSB1cGRhdGVkIHdpZGdldHNcbiAgICAgKi9cbiAgICB1cGRhdGVBbGwgOiBmdW5jdGlvbih3aWRnZXRzKSB7XG4gICAgICAgIHZhciBjb250YWluZXIgPSB0aGlzO1xuICAgICAgICByZXR1cm4gXy5lYWNoKHdpZGdldHMsIGZ1bmN0aW9uICh3aWRnZXQpIHtcbiAgICAgICAgICAgIHdpZGdldC5pbnN0YW5jZXMgPSBfLmVhY2god2lkZ2V0Lmluc3RhbmNlcywgZnVuY3Rpb24gKGluc3RhbmNlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnN0YW5jZS51cGRhdGUgPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGluc3RhbmNlLnVwZGF0ZS5jYWxsKGluc3RhbmNlLCBjb250YWluZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gaW5zdGFuY2U7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB3aWRnZXQ7XG4gICAgICAgIH0pO1xuICAgIH1cbn0pO1xuXG4vKipcbiAqIENyZWF0ZSBhIG5ldyBzZXJ2aWNlIGNvbnRhaW5lclxuICogQHNlZSBDb250YWluZXIgZm9yIHBhcmFtcy5cbiAqL1xuZXhwb3J0cy5jcmVhdGUgPSAoZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGFyZ3MpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDb250YWluZXIoYXJncyk7XG4gICAgfVxufSkoKTtcblxuZXhwb3J0cy5Db25zdHJ1Y3RvciA9IENvbnRhaW5lcjtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jb250YWluZXIuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBBcGlDbGllbnQgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvYXBpX2NsaWVudCcpO1xudmFyIENyZWF0b3IgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvY3JlYXRvcicpO1xuXG4vKipcbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gQ29udHJvbGxlcigpe31cblxubW9kdWxlLmV4cG9ydHMgPSBDcmVhdG9yLnByb3RvdHlwZS5leHRlbmQoQ3JlYXRvciwgQ29udHJvbGxlciwge1xuICAgIGNsaWVudDogbmV3IEFwaUNsaWVudCgpXG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jb250cm9sbGVyLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29ya1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgRXh0ZW5kYWJsZSA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2ZyYW1ld29yay9leHRlbmRhYmxlJyk7XG5cbi8qKlxuICogVGhlIEFscGhhICYgT21lZ2Egb2Ygb2JqZWN0IGNyZWF0aW9uXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gQ3JlYXRvcigpe31cblxubW9kdWxlLmV4cG9ydHMgPSBFeHRlbmRhYmxlLnByb3RvdHlwZS5leHRlbmQoRXh0ZW5kYWJsZSwgQ3JlYXRvciwge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgaW5zdGFuY2Ugb2YgdGhlIGNvbnRyb2xsZXIgd2l0aCBwcm9wcyBhcyBwcm9wZXJ0aWVzLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fEZ1bmN0aW9ufSBwcm9wc1xuICAgICAqICBmdW5jdGlvbnMgc2hvdWxkIGhhdmUgdGhlIGZvbGxpbmcgc2lnbmF0dXJlLlxuICAgICAqICAgICAgZnVuY3Rpb24oe09iamVjdH0gaW5zdGFuY2UpIC0+IHtPYmplY3R9XG4gICAgICogQHJldHVybnMge09iamVjdH0gYSBuZXcgbW9kZWwgaW5zdGFuY2VcbiAgICAgKi9cbiAgICBjcmVhdGUgOiBmdW5jdGlvbihwcm9wcyl7XG4gICAgICAgIHZhciBpbnN0YW5jZSA9IE9iamVjdC5jcmVhdGUodGhpcyk7XG4gICAgICAgIGlmIChfLmlzRnVuY3Rpb24ocHJvcHMpKSB7XG4gICAgICAgICAgICBwcm9wcyA9IHByb3BzLmNhbGwodGhpcywgaW5zdGFuY2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBfLmV4dGVuZChpbnN0YW5jZSwgcHJvcHMgfHwge30pO1xuICAgIH1cbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrL2NyZWF0b3IuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmZ1bmN0aW9uIEV4dGVuZGFibGUoKXt9XG5cbi8vIEV4dGVuZCB0aGUgZXh0ZW5kYWJsZS4gSG93IGZhciBvdXQgaXMgdGhpcz9cbl8uZXh0ZW5kKEV4dGVuZGFibGUucHJvdG90eXBlLCB7XG4gICAgLyoqXG4gICAgICogRXh0ZW5kIFwic3ViY2xhc3Nlc1wiIHdpdGggY29udHJvbGxlciBtZXRob2RzXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gcGFyZW50XG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2hpbGRcbiAgICAgKiBAcGFyYW0ge09iamVjdHxGdW5jdGlvbn0gZXh0cmFzIC0gYWRkaXRpb25hbCBwcm9wZXJ0aWVzIHRvIGFkZCB0byBwcm90b3R5cGUuXG4gICAgICogQHJldHVybnMge0Z1bmN0aW9ufVxuICAgICAqL1xuICAgIGV4dGVuZDogZnVuY3Rpb24ocGFyZW50LCBjaGlsZCwgZXh0cmFzKXtcbiAgICAgICAgY2hpbGQucHJvdG90eXBlID0gXy5leHRlbmQoY2hpbGQucHJvdG90eXBlLCBPYmplY3QuY3JlYXRlKHBhcmVudC5wcm90b3R5cGUpKTtcbiAgICAgICAgY2hpbGQucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY2hpbGQ7XG4gICAgICAgIGlmIChleHRyYXMpIHtcbiAgICAgICAgICAgIGlmIChfLmlzRnVuY3Rpb24oZXh0cmFzKSkge1xuICAgICAgICAgICAgICAgIGV4dHJhcyA9IGV4dHJhcy5jYWxsKGNoaWxkLCBjaGlsZCwgcGFyZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNoaWxkLnByb3RvdHlwZSA9IF8uZXh0ZW5kKGNoaWxkLnByb3RvdHlwZSwgZXh0cmFzIHx8IHt9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2hpbGQ7XG4gICAgfVxufSk7XG5tb2R1bGUuZXhwb3J0cyA9IEV4dGVuZGFibGU7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmsvZXh0ZW5kYWJsZS5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmtcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIENyZWF0b3IgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvY3JlYXRvcicpO1xuXG4vKipcbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gTW9kZWwoKXt9XG5cbm1vZHVsZS5leHBvcnRzID0gQ3JlYXRvci5wcm90b3R5cGUuZXh0ZW5kKENyZWF0b3IsIE1vZGVsKTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay9tb2RlbC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmtcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIENyZWF0b3IgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvY3JlYXRvcicpO1xuXG4vKipcbiAqIFVzZWQgdG8gY3JlYXRlIHByb3RvdHlwZSBmb3Igdmlld3MuXG4gKiBAY29uc3RydWN0b3Igbm90IGludGVuZGVkIGZvciBkaXJlY3QgdXNlLlxuICovXG5mdW5jdGlvbiBWaWV3KCl7fVxuXG5tb2R1bGUuZXhwb3J0cyA9IENyZWF0b3IucHJvdG90eXBlLmV4dGVuZChDcmVhdG9yLCBWaWV3LCB7XG4gICAgLyoqXG4gICAgICogRXhwYW5kcyB0aGUgLnRlbXBsYXRlIHdpdGggdmlld19kYXRhIGFzc2lnbmVkIGFzIHRoZSB0ZW1wbGF0ZXMgY29udGV4dFxuICAgICAqICBUaGlzIG1lYW5zIHRoYXQgYW55IHZpZXcgZGF0YSBjYW4gYmUgYWNjZXNzZWQgd2l0aCBgdGhpc2AgZnJvbSB0aGUgdGVtcGxhdGVcbiAgICAgKiBAcGFyYW0gdmlld19kYXRhXG4gICAgICogQHBhcmFtIHRyYW5zbGF0aW9uc1xuICAgICAqIEByZXR1cm5zIHtqUXVlcnl9XG4gICAgICovXG4gICAgcmVuZGVyIDogZnVuY3Rpb24odmlld19kYXRhLCB0cmFuc2xhdGlvbnMpe1xuICAgICAgICB2YXIgcmVuZGVyZWQ7XG5cbiAgICAgICAgdmlld19kYXRhID0gdmlld19kYXRhIHx8IHt9O1xuICAgICAgICB0cmFuc2xhdGlvbnMgPSAgXy5kZWZhdWx0cyh0cmFuc2xhdGlvbnMgfHwge30sIHRoaXMuZGVmYXVsdFRyYW5zbGF0aW9ucyB8fCB7fSk7XG4gICAgICAgIHJlbmRlcmVkID0gJCh0aGlzLnRlbXBsYXRlLmNhbGwoXG4gICAgICAgICAgICBfLmV4dGVuZChcbiAgICAgICAgICAgICAgICB2aWV3X2RhdGEsIHtcbiAgICAgICAgICAgICAgICAgICAgdHJhbnM6IF8uZGVmYXVsdHModHJhbnNsYXRpb25zIHx8IHt9LCB0aGlzLmRlZmF1bHRUcmFuc2xhdGlvbnMgfHwge30pXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAvLyBzaG9ydGN1dCB0byB0cmFuc2xhdGlvbnNcbiAgICAgICAgICAgICAgICB0IDogdHJhbnNsYXRpb25zXG4gICAgICAgICAgICB9XG4gICAgICAgICkpO1xuXG4gICAgICAgIGlmIChfLmlzRnVuY3Rpb24odGhpc1snYWZ0ZXJSZW5kZXInXSkpIHtcbiAgICAgICAgICAgIHRoaXMuYWZ0ZXJSZW5kZXIocmVuZGVyZWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlbmRlcmVkO1xuICAgIH1cbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrL3ZpZXcuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBDcmVhdG9yID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL2NyZWF0b3InKTtcblxuLyoqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gV2lkZ2V0KCl7fVxuXG5tb2R1bGUuZXhwb3J0cyA9IENyZWF0b3IucHJvdG90eXBlLmV4dGVuZChDcmVhdG9yLCBXaWRnZXQsIHtcbiAgICBuYW1lOiBudWxsLFxuICAgIHNlbGVjdG9yIDogbnVsbCxcbiAgICBzdGFydFVwOiBmdW5jdGlvbigpe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ0aGlzLm5hbWUgXCIrXCJ3aWRnZXQgZG9lcyBub3QgaW1wbGVtZW50IHRoZSAuc3RhcnRVcCBtZXRob2RcIik7XG4gICAgfSxcbiAgICAvKipcbiAgICAgKiBDcmVhdGUgd3JhcHBpbmcgZWxlbWVudCBmb3IgY3JlYXRpbmcgd2lkZ2V0cyBvbiB0aGUgZmx5LlxuICAgICAqIEByZXR1cm5zIHtqUXVlcnl9XG4gICAgICovXG4gICAgY3JlYXRlRWxlbWVudCA6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiAkKCc8ZGl2IGNsYXNzPVwid2luZHRhbGtlcnMtd2lkZ2V0XCI+JylcbiAgICAgICAgICAgIC5hZGRDbGFzcyh0aGlzLnNlbGVjdG9yLnJlcGxhY2UoJy4nLCAnJykpO1xuICAgIH1cbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrL3dpZGdldC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmtcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxuLyoqXG4gKiBPYmplY3QuY3JlYXRlIHBvbHlmaWxsXG4gKiBAc2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9jcmVhdGUjUG9seWZpbGxcbiAqL1xuaWYgKHR5cGVvZiBPYmplY3QuY3JlYXRlICE9ICdmdW5jdGlvbicpIHtcbiAgICAoZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgRiA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICBPYmplY3QuY3JlYXRlID0gZnVuY3Rpb24gKG8pIHtcbiAgICAgICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgIHRocm93IEVycm9yKCdTZWNvbmQgYXJndW1lbnQgbm90IHN1cHBvcnRlZCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBvICE9ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgVHlwZUVycm9yKCdBcmd1bWVudCBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgRi5wcm90b3R5cGUgPSBvO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGKCk7XG4gICAgICAgIH07XG4gICAgfSkoKTtcbn1cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL3BvbHlmaWxsLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnJlcXVpcmUoJ3dpbmR0YWxrZXJzL3BvbHlmaWxsJyk7XG52YXIgQ3JlYXRvciA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jcmVhdG9yJyk7XG52YXIgQ29udGFpbmVyID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL2NvbnRhaW5lcicpO1xudmFyIHdpbmR0YWxrZXJzO1xuXG5mdW5jdGlvbiBXaW5kdGFsa2VycyhvcHRpb25zKXtcbiAgICByZXR1cm4gV2luZHRhbGtlcnMucHJvdG90eXBlLmNyZWF0ZSh7XG4gICAgICAgIGNvbnRhaW5lcjogQ29udGFpbmVyLmNyZWF0ZShvcHRpb25zKVxuICAgIH0pXG59XG5cbkNyZWF0b3IucHJvdG90eXBlLmV4dGVuZChDcmVhdG9yLCBXaW5kdGFsa2Vycywge1xuICAgIGluaXQgOiBmdW5jdGlvbigpe1xuICAgICAgICB2YXIgd2lkZ2V0cyA9IHt9O1xuICAgICAgICB3aWRnZXRzLnJlZ2lzdGVyZWQgPSB0aGlzLmNvbnRhaW5lci5yZWdpc3RlcihbXG4gICAgICAgICAgICByZXF1aXJlKCd3aW5kdGFsa2Vycy9hcHAvd2lkZ2V0cy9tb2RhbF93aWRnZXQnKSxcbiAgICAgICAgICAgIHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2FwcC93aWRnZXRzL3RhYmxlX3dpZGdldCcpLFxuICAgICAgICAgICAgcmVxdWlyZSgnd2luZHRhbGtlcnMvYXBwL3dpZGdldHMvbWFwX3dpZGdldCcpXG4gICAgICAgIF0pO1xuICAgICAgICB3aWRnZXRzLnN0YXJ0ZWQgPSB0aGlzLmNvbnRhaW5lci5zdGFydEFsbCh3aWRnZXRzLnJlZ2lzdGVyZWQpO1xuICAgICAgICByZXR1cm4gd2lkZ2V0cztcbiAgICB9XG59KTtcblxualF1ZXJ5KGRvY3VtZW50KS5yZWFkeShmdW5jdGlvbigpe1xuICAgIFdpbmR0YWxrZXJzKCkuaW5pdCgpO1xufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gV2luZHRhbGtlcnM7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2Zha2VfM2Y1MzI2NmUuanNcIixcIi9cIikiXX0=
