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
        instance = ModalController.prototype.create({ view : ModalView() });

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
                    }),
                    stations: stations
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

        var Icon = require('windtalkers/maps/icon');
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
},{"buffer":1,"oMfpAn":4,"windtalkers/framework/view":22,"windtalkers/maps/icon":24}],13:[function(require,module,exports){
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
    var baseUrl = (window.location.host === 'www.blast.nu') ? '' : 'http://www.blast.nu';
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
Extendable.prototype = _.extend(Extendable.prototype, {
    /**
     * Extend "subclasses" with controller methods
     * @param {Function} parent
     * @param {Function} child
     * @param {Object|Function} extras - additional properties to add to prototype.
     * @returns {Function}
     */
    extend: function(parent, child, extras){
        child.prototype = _.extend(child.prototype, parent.prototype);
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
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/../../node_modules/windtalkers/maps/icon.js","/../../node_modules/windtalkers/maps")
},{"buffer":1,"oMfpAn":4}],25:[function(require,module,exports){
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
},{"buffer":1,"oMfpAn":4}],26:[function(require,module,exports){
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
}).call(this,require("oMfpAn"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/fake_d6162e63.js","/")
},{"buffer":1,"oMfpAn":4,"windtalkers/app/widgets/map_widget":13,"windtalkers/app/widgets/modal_widget":14,"windtalkers/app/widgets/table_widget":15,"windtalkers/framework/container":17,"windtalkers/framework/creator":19,"windtalkers/polyfill":25}]},{},[26])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL21heGNhbC9wcm9qZWN0cy93aW5kdGFsa2Vycy1tb2NoYS9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwiL1VzZXJzL21heGNhbC9wcm9qZWN0cy93aW5kdGFsa2Vycy1tb2NoYS9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL2NvbnRyb2xsZXJzL21vZGFsX2NvbnRyb2xsZXIuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvY29udHJvbGxlcnMvb2JzZXJ2YXRpb25zX2NvbnRyb2xsZXIuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvY29udHJvbGxlcnMvc3RhdGlvbnNfY29udHJvbGxlci5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC9tb2RlbHMvb2JzZXJ2YXRpb24uanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvbW9kZWxzL3N0YXRpb24uanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvdmlld3MvYXBwbGljYXRpb24vbW9kYWwuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvdmlld3Mvb2JzZXJ2YXRpb25zL3RhYmxlLmpzIiwiL1VzZXJzL21heGNhbC9wcm9qZWN0cy93aW5kdGFsa2Vycy1tb2NoYS9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL3ZpZXdzL3N0YXRpb25zL21hcC5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC93aWRnZXRzL21hcF93aWRnZXQuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvd2lkZ2V0cy9tb2RhbF93aWRnZXQuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvd2lkZ2V0cy90YWJsZV93aWRnZXQuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmsvYXBpX2NsaWVudC5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jb250YWluZXIuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmsvY29udHJvbGxlci5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jcmVhdG9yLmpzIiwiL1VzZXJzL21heGNhbC9wcm9qZWN0cy93aW5kdGFsa2Vycy1tb2NoYS9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrL2V4dGVuZGFibGUuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmsvbW9kZWwuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmsvdmlldy5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay93aWRnZXQuanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9tYXBzL2ljb24uanMiLCIvVXNlcnMvbWF4Y2FsL3Byb2plY3RzL3dpbmR0YWxrZXJzLW1vY2hhL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9wb2x5ZmlsbC5qcyIsIi9Vc2Vycy9tYXhjYWwvcHJvamVjdHMvd2luZHRhbGtlcnMtbW9jaGEvc3JjL2pzL2Zha2VfZDYxNjJlNjMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG4vKiFcbiAqIFRoZSBidWZmZXIgbW9kdWxlIGZyb20gbm9kZS5qcywgZm9yIHRoZSBicm93c2VyLlxuICpcbiAqIEBhdXRob3IgICBGZXJvc3MgQWJvdWtoYWRpamVoIDxmZXJvc3NAZmVyb3NzLm9yZz4gPGh0dHA6Ly9mZXJvc3Mub3JnPlxuICogQGxpY2Vuc2UgIE1JVFxuICovXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcblxuZXhwb3J0cy5CdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuU2xvd0J1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUyA9IDUwXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyXG5cbi8qKlxuICogSWYgYEJ1ZmZlci5fdXNlVHlwZWRBcnJheXNgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAoY29tcGF0aWJsZSBkb3duIHRvIElFNilcbiAqL1xuQnVmZmVyLl91c2VUeXBlZEFycmF5cyA9IChmdW5jdGlvbiAoKSB7XG4gIC8vIERldGVjdCBpZiBicm93c2VyIHN1cHBvcnRzIFR5cGVkIEFycmF5cy4gU3VwcG9ydGVkIGJyb3dzZXJzIGFyZSBJRSAxMCssIEZpcmVmb3ggNCssXG4gIC8vIENocm9tZSA3KywgU2FmYXJpIDUuMSssIE9wZXJhIDExLjYrLCBpT1MgNC4yKy4gSWYgdGhlIGJyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBhZGRpbmdcbiAgLy8gcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzLCB0aGVuIHRoYXQncyB0aGUgc2FtZSBhcyBubyBgVWludDhBcnJheWAgc3VwcG9ydFxuICAvLyBiZWNhdXNlIHdlIG5lZWQgdG8gYmUgYWJsZSB0byBhZGQgYWxsIHRoZSBub2RlIEJ1ZmZlciBBUEkgbWV0aG9kcy4gVGhpcyBpcyBhbiBpc3N1ZVxuICAvLyBpbiBGaXJlZm94IDQtMjkuIE5vdyBmaXhlZDogaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9Njk1NDM4XG4gIHRyeSB7XG4gICAgdmFyIGJ1ZiA9IG5ldyBBcnJheUJ1ZmZlcigwKVxuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheShidWYpXG4gICAgYXJyLmZvbyA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIDQyIH1cbiAgICByZXR1cm4gNDIgPT09IGFyci5mb28oKSAmJlxuICAgICAgICB0eXBlb2YgYXJyLnN1YmFycmF5ID09PSAnZnVuY3Rpb24nIC8vIENocm9tZSA5LTEwIGxhY2sgYHN1YmFycmF5YFxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn0pKClcblxuLyoqXG4gKiBDbGFzczogQnVmZmVyXG4gKiA9PT09PT09PT09PT09XG4gKlxuICogVGhlIEJ1ZmZlciBjb25zdHJ1Y3RvciByZXR1cm5zIGluc3RhbmNlcyBvZiBgVWludDhBcnJheWAgdGhhdCBhcmUgYXVnbWVudGVkXG4gKiB3aXRoIGZ1bmN0aW9uIHByb3BlcnRpZXMgZm9yIGFsbCB0aGUgbm9kZSBgQnVmZmVyYCBBUEkgZnVuY3Rpb25zLiBXZSB1c2VcbiAqIGBVaW50OEFycmF5YCBzbyB0aGF0IHNxdWFyZSBicmFja2V0IG5vdGF0aW9uIHdvcmtzIGFzIGV4cGVjdGVkIC0tIGl0IHJldHVybnNcbiAqIGEgc2luZ2xlIG9jdGV0LlxuICpcbiAqIEJ5IGF1Z21lbnRpbmcgdGhlIGluc3RhbmNlcywgd2UgY2FuIGF2b2lkIG1vZGlmeWluZyB0aGUgYFVpbnQ4QXJyYXlgXG4gKiBwcm90b3R5cGUuXG4gKi9cbmZ1bmN0aW9uIEJ1ZmZlciAoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQnVmZmVyKSlcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKVxuXG4gIHZhciB0eXBlID0gdHlwZW9mIHN1YmplY3RcblxuICAvLyBXb3JrYXJvdW5kOiBub2RlJ3MgYmFzZTY0IGltcGxlbWVudGF0aW9uIGFsbG93cyBmb3Igbm9uLXBhZGRlZCBzdHJpbmdzXG4gIC8vIHdoaWxlIGJhc2U2NC1qcyBkb2VzIG5vdC5cbiAgaWYgKGVuY29kaW5nID09PSAnYmFzZTY0JyAmJiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHN1YmplY3QgPSBzdHJpbmd0cmltKHN1YmplY3QpXG4gICAgd2hpbGUgKHN1YmplY3QubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgICAgc3ViamVjdCA9IHN1YmplY3QgKyAnPSdcbiAgICB9XG4gIH1cblxuICAvLyBGaW5kIHRoZSBsZW5ndGhcbiAgdmFyIGxlbmd0aFxuICBpZiAodHlwZSA9PT0gJ251bWJlcicpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKVxuICAgIGxlbmd0aCA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHN1YmplY3QsIGVuY29kaW5nKVxuICBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0JylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdC5sZW5ndGgpIC8vIGFzc3VtZSB0aGF0IG9iamVjdCBpcyBhcnJheS1saWtlXG4gIGVsc2VcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IG5lZWRzIHRvIGJlIGEgbnVtYmVyLCBhcnJheSBvciBzdHJpbmcuJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgLy8gUHJlZmVycmVkOiBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIGJ1ZiA9IEJ1ZmZlci5fYXVnbWVudChuZXcgVWludDhBcnJheShsZW5ndGgpKVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gVEhJUyBpbnN0YW5jZSBvZiBCdWZmZXIgKGNyZWF0ZWQgYnkgYG5ld2ApXG4gICAgYnVmID0gdGhpc1xuICAgIGJ1Zi5sZW5ndGggPSBsZW5ndGhcbiAgICBidWYuX2lzQnVmZmVyID0gdHJ1ZVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgdHlwZW9mIHN1YmplY3QuYnl0ZUxlbmd0aCA9PT0gJ251bWJlcicpIHtcbiAgICAvLyBTcGVlZCBvcHRpbWl6YXRpb24gLS0gdXNlIHNldCBpZiB3ZSdyZSBjb3B5aW5nIGZyb20gYSB0eXBlZCBhcnJheVxuICAgIGJ1Zi5fc2V0KHN1YmplY3QpXG4gIH0gZWxzZSBpZiAoaXNBcnJheWlzaChzdWJqZWN0KSkge1xuICAgIC8vIFRyZWF0IGFycmF5LWlzaCBvYmplY3RzIGFzIGEgYnl0ZSBhcnJheVxuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSlcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdC5yZWFkVUludDgoaSlcbiAgICAgIGVsc2VcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdFtpXVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xuICAgIGJ1Zi53cml0ZShzdWJqZWN0LCAwLCBlbmNvZGluZylcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJyAmJiAhQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiAhbm9aZXJvKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBidWZbaV0gPSAwXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBTVEFUSUMgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT1cblxuQnVmZmVyLmlzRW5jb2RpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiB0cnVlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5pc0J1ZmZlciA9IGZ1bmN0aW9uIChiKSB7XG4gIHJldHVybiAhIShiICE9PSBudWxsICYmIGIgIT09IHVuZGVmaW5lZCAmJiBiLl9pc0J1ZmZlcilcbn1cblxuQnVmZmVyLmJ5dGVMZW5ndGggPSBmdW5jdGlvbiAoc3RyLCBlbmNvZGluZykge1xuICB2YXIgcmV0XG4gIHN0ciA9IHN0ciArICcnXG4gIHN3aXRjaCAoZW5jb2RpbmcgfHwgJ3V0ZjgnKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggLyAyXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IHV0ZjhUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBiYXNlNjRUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoICogMlxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5jb25jYXQgPSBmdW5jdGlvbiAobGlzdCwgdG90YWxMZW5ndGgpIHtcbiAgYXNzZXJ0KGlzQXJyYXkobGlzdCksICdVc2FnZTogQnVmZmVyLmNvbmNhdChsaXN0LCBbdG90YWxMZW5ndGhdKVxcbicgK1xuICAgICAgJ2xpc3Qgc2hvdWxkIGJlIGFuIEFycmF5LicpXG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfSBlbHNlIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBsaXN0WzBdXG4gIH1cblxuICB2YXIgaVxuICBpZiAodHlwZW9mIHRvdGFsTGVuZ3RoICE9PSAnbnVtYmVyJykge1xuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB0b3RhbExlbmd0aCArPSBsaXN0W2ldLmxlbmd0aFxuICAgIH1cbiAgfVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHRvdGFsTGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbi8vIEJVRkZFUiBJTlNUQU5DRSBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBfaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBhc3NlcnQoc3RyTGVuICUgMiA9PT0gMCwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG5cbiAgaWYgKGxlbmd0aCA+IHN0ckxlbiAvIDIpIHtcbiAgICBsZW5ndGggPSBzdHJMZW4gLyAyXG4gIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHZhciBieXRlID0gcGFyc2VJbnQoc3RyaW5nLnN1YnN0cihpICogMiwgMiksIDE2KVxuICAgIGFzc2VydCghaXNOYU4oYnl0ZSksICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuICAgIGJ1ZltvZmZzZXQgKyBpXSA9IGJ5dGVcbiAgfVxuICBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9IGkgKiAyXG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIF91dGY4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYXNjaWlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihhc2NpaVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gX2FzY2lpV3JpdGUoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF91dGYxNmxlV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIodXRmMTZsZVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKSB7XG4gIC8vIFN1cHBvcnQgYm90aCAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpXG4gIC8vIGFuZCB0aGUgbGVnYWN5IChzdHJpbmcsIGVuY29kaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgaWYgKGlzRmluaXRlKG9mZnNldCkpIHtcbiAgICBpZiAoIWlzRmluaXRlKGxlbmd0aCkpIHtcbiAgICAgIGVuY29kaW5nID0gbGVuZ3RoXG4gICAgICBsZW5ndGggPSB1bmRlZmluZWRcbiAgICB9XG4gIH0gZWxzZSB7ICAvLyBsZWdhY3lcbiAgICB2YXIgc3dhcCA9IGVuY29kaW5nXG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBvZmZzZXQgPSBsZW5ndGhcbiAgICBsZW5ndGggPSBzd2FwXG4gIH1cblxuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSB0aGlzLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuXG4gIHZhciByZXRcbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBfaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gX3V0ZjhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBfYXNjaWlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0ID0gX2JpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBfYmFzZTY0V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IF91dGYxNmxlV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuICBzdGFydCA9IE51bWJlcihzdGFydCkgfHwgMFxuICBlbmQgPSAoZW5kICE9PSB1bmRlZmluZWQpXG4gICAgPyBOdW1iZXIoZW5kKVxuICAgIDogZW5kID0gc2VsZi5sZW5ndGhcblxuICAvLyBGYXN0cGF0aCBlbXB0eSBzdHJpbmdzXG4gIGlmIChlbmQgPT09IHN0YXJ0KVxuICAgIHJldHVybiAnJ1xuXG4gIHZhciByZXRcbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBfaGV4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gX3V0ZjhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBfYXNjaWlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0ID0gX2JpbmFyeVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBfYmFzZTY0U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IF91dGYxNmxlU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG4vLyBjb3B5KHRhcmdldEJ1ZmZlciwgdGFyZ2V0U3RhcnQ9MCwgc291cmNlU3RhcnQ9MCwgc291cmNlRW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiAodGFyZ2V0LCB0YXJnZXRfc3RhcnQsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNvdXJjZSA9IHRoaXNcblxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgJiYgZW5kICE9PSAwKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoIXRhcmdldF9zdGFydCkgdGFyZ2V0X3N0YXJ0ID0gMFxuXG4gIC8vIENvcHkgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHNvdXJjZS5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIC8vIEZhdGFsIGVycm9yIGNvbmRpdGlvbnNcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ3NvdXJjZUVuZCA8IHNvdXJjZVN0YXJ0JylcbiAgYXNzZXJ0KHRhcmdldF9zdGFydCA+PSAwICYmIHRhcmdldF9zdGFydCA8IHRhcmdldC5sZW5ndGgsXG4gICAgICAndGFyZ2V0U3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgc291cmNlLmxlbmd0aCwgJ3NvdXJjZVN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VFbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgLy8gQXJlIHdlIG9vYj9cbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKVxuICAgIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0IDwgZW5kIC0gc3RhcnQpXG4gICAgZW5kID0gdGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCArIHN0YXJ0XG5cbiAgdmFyIGxlbiA9IGVuZCAtIHN0YXJ0XG5cbiAgaWYgKGxlbiA8IDEwMCB8fCAhQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICB0YXJnZXRbaSArIHRhcmdldF9zdGFydF0gPSB0aGlzW2kgKyBzdGFydF1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQuX3NldCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksIHRhcmdldF9zdGFydClcbiAgfVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBpZiAoc3RhcnQgPT09IDAgJiYgZW5kID09PSBidWYubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1ZilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmLnNsaWNlKHN0YXJ0LCBlbmQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIF91dGY4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmVzID0gJydcbiAgdmFyIHRtcCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIGlmIChidWZbaV0gPD0gMHg3Rikge1xuICAgICAgcmVzICs9IGRlY29kZVV0ZjhDaGFyKHRtcCkgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgICAgIHRtcCA9ICcnXG4gICAgfSBlbHNlIHtcbiAgICAgIHRtcCArPSAnJScgKyBidWZbaV0udG9TdHJpbmcoMTYpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlcyArIGRlY29kZVV0ZjhDaGFyKHRtcClcbn1cblxuZnVuY3Rpb24gX2FzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKVxuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgcmV0dXJuIHJldFxufVxuXG5mdW5jdGlvbiBfYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gX2FzY2lpU2xpY2UoYnVmLCBzdGFydCwgZW5kKVxufVxuXG5mdW5jdGlvbiBfaGV4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuXG4gIGlmICghc3RhcnQgfHwgc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgfHwgZW5kIDwgMCB8fCBlbmQgPiBsZW4pIGVuZCA9IGxlblxuXG4gIHZhciBvdXQgPSAnJ1xuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIG91dCArPSB0b0hleChidWZbaV0pXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG5mdW5jdGlvbiBfdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpKzFdICogMjU2KVxuICB9XG4gIHJldHVybiByZXNcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5zbGljZSA9IGZ1bmN0aW9uIChzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBzdGFydCA9IGNsYW1wKHN0YXJ0LCBsZW4sIDApXG4gIGVuZCA9IGNsYW1wKGVuZCwgbGVuLCBsZW4pXG5cbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICByZXR1cm4gQnVmZmVyLl9hdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG4vLyBgZ2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gIH0gZWxzZSB7XG4gICAgdmFsID0gYnVmW29mZnNldF0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMl0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICAgIHZhbCB8PSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXQgKyAzXSA8PCAyNCA+Pj4gMClcbiAgfSBlbHNlIHtcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAxXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAyXSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDNdXG4gICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXRdIDw8IDI0ID4+PiAwKVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCxcbiAgICAgICAgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHZhciBuZWcgPSB0aGlzW29mZnNldF0gJiAweDgwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDE2KGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQzMihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwMDAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRGbG9hdCAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdExFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZERvdWJsZSAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmYpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKSByZXR1cm5cblxuICB0aGlzW29mZnNldF0gPSB2YWx1ZVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDIpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlICYgKDB4ZmYgPDwgKDggKiAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSkpKSA+Pj5cbiAgICAgICAgICAgIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpICogOFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZiwgLTB4ODApXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIHRoaXMud3JpdGVVSW50OCh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydClcbiAgZWxzZVxuICAgIHRoaXMud3JpdGVVSW50OCgweGZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmYsIC0weDgwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MTYoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgMHhmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZmZmZmYsIC0weDgwMDAwMDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQzMihidWYsIDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMy40MDI4MjM0NjYzODUyODg2ZSszOCwgLTMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLFxuICAgICAgICAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbi8vIGZpbGwodmFsdWUsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5maWxsID0gZnVuY3Rpb24gKHZhbHVlLCBzdGFydCwgZW5kKSB7XG4gIGlmICghdmFsdWUpIHZhbHVlID0gMFxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQpIGVuZCA9IHRoaXMubGVuZ3RoXG5cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YWx1ZSA9IHZhbHVlLmNoYXJDb2RlQXQoMClcbiAgfVxuXG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmICFpc05hTih2YWx1ZSksICd2YWx1ZSBpcyBub3QgYSBudW1iZXInKVxuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCB0aGlzLmxlbmd0aCwgJ3N0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHRoaXMubGVuZ3RoLCAnZW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgdGhpc1tpXSA9IHZhbHVlXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgb3V0ID0gW11cbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBvdXRbaV0gPSB0b0hleCh0aGlzW2ldKVxuICAgIGlmIChpID09PSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTKSB7XG4gICAgICBvdXRbaSArIDFdID0gJy4uLidcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIHJldHVybiAnPEJ1ZmZlciAnICsgb3V0LmpvaW4oJyAnKSArICc+J1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEFycmF5QnVmZmVyYCB3aXRoIHRoZSAqY29waWVkKiBtZW1vcnkgb2YgdGhlIGJ1ZmZlciBpbnN0YW5jZS5cbiAqIEFkZGVkIGluIE5vZGUgMC4xMi4gT25seSBhdmFpbGFibGUgaW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEFycmF5QnVmZmVyLlxuICovXG5CdWZmZXIucHJvdG90eXBlLnRvQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgICAgcmV0dXJuIChuZXcgQnVmZmVyKHRoaXMpKS5idWZmZXJcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJ1ZiA9IG5ldyBVaW50OEFycmF5KHRoaXMubGVuZ3RoKVxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGJ1Zi5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMSlcbiAgICAgICAgYnVmW2ldID0gdGhpc1tpXVxuICAgICAgcmV0dXJuIGJ1Zi5idWZmZXJcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCdWZmZXIudG9BcnJheUJ1ZmZlciBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicpXG4gIH1cbn1cblxuLy8gSEVMUEVSIEZVTkNUSU9OU1xuLy8gPT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBzdHJpbmd0cmltIChzdHIpIHtcbiAgaWYgKHN0ci50cmltKSByZXR1cm4gc3RyLnRyaW0oKVxuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxufVxuXG52YXIgQlAgPSBCdWZmZXIucHJvdG90eXBlXG5cbi8qKlxuICogQXVnbWVudCBhIFVpbnQ4QXJyYXkgKmluc3RhbmNlKiAobm90IHRoZSBVaW50OEFycmF5IGNsYXNzISkgd2l0aCBCdWZmZXIgbWV0aG9kc1xuICovXG5CdWZmZXIuX2F1Z21lbnQgPSBmdW5jdGlvbiAoYXJyKSB7XG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG4vLyBzbGljZShzdGFydCwgZW5kKVxuZnVuY3Rpb24gY2xhbXAgKGluZGV4LCBsZW4sIGRlZmF1bHRWYWx1ZSkge1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSAnbnVtYmVyJykgcmV0dXJuIGRlZmF1bHRWYWx1ZVxuICBpbmRleCA9IH5+aW5kZXg7ICAvLyBDb2VyY2UgdG8gaW50ZWdlci5cbiAgaWYgKGluZGV4ID49IGxlbikgcmV0dXJuIGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIGluZGV4ICs9IGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGNvZXJjZSAobGVuZ3RoKSB7XG4gIC8vIENvZXJjZSBsZW5ndGggdG8gYSBudW1iZXIgKHBvc3NpYmx5IE5hTiksIHJvdW5kIHVwXG4gIC8vIGluIGNhc2UgaXQncyBmcmFjdGlvbmFsIChlLmcuIDEyMy40NTYpIHRoZW4gZG8gYVxuICAvLyBkb3VibGUgbmVnYXRlIHRvIGNvZXJjZSBhIE5hTiB0byAwLiBFYXN5LCByaWdodD9cbiAgbGVuZ3RoID0gfn5NYXRoLmNlaWwoK2xlbmd0aClcbiAgcmV0dXJuIGxlbmd0aCA8IDAgPyAwIDogbGVuZ3RoXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXkgKHN1YmplY3QpIHtcbiAgcmV0dXJuIChBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChzdWJqZWN0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzdWJqZWN0KSA9PT0gJ1tvYmplY3QgQXJyYXldJ1xuICB9KShzdWJqZWN0KVxufVxuXG5mdW5jdGlvbiBpc0FycmF5aXNoIChzdWJqZWN0KSB7XG4gIHJldHVybiBpc0FycmF5KHN1YmplY3QpIHx8IEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSB8fFxuICAgICAgc3ViamVjdCAmJiB0eXBlb2Ygc3ViamVjdCA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHR5cGVvZiBzdWJqZWN0Lmxlbmd0aCA9PT0gJ251bWJlcidcbn1cblxuZnVuY3Rpb24gdG9IZXggKG4pIHtcbiAgaWYgKG4gPCAxNikgcmV0dXJuICcwJyArIG4udG9TdHJpbmcoMTYpXG4gIHJldHVybiBuLnRvU3RyaW5nKDE2KVxufVxuXG5mdW5jdGlvbiB1dGY4VG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIHZhciBiID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBpZiAoYiA8PSAweDdGKVxuICAgICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkpXG4gICAgZWxzZSB7XG4gICAgICB2YXIgc3RhcnQgPSBpXG4gICAgICBpZiAoYiA+PSAweEQ4MDAgJiYgYiA8PSAweERGRkYpIGkrK1xuICAgICAgdmFyIGggPSBlbmNvZGVVUklDb21wb25lbnQoc3RyLnNsaWNlKHN0YXJ0LCBpKzEpKS5zdWJzdHIoMSkuc3BsaXQoJyUnKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBoLmxlbmd0aDsgaisrKVxuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYywgaGksIGxvXG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBwb3NcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSlcbiAgICAgIGJyZWFrXG4gICAgZHN0W2kgKyBvZmZzZXRdID0gc3JjW2ldXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gZGVjb2RlVXRmOENoYXIgKHN0cikge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgweEZGRkQpIC8vIFVURiA4IGludmFsaWQgY2hhclxuICB9XG59XG5cbi8qXG4gKiBXZSBoYXZlIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSB2YWx1ZSBpcyBhIHZhbGlkIGludGVnZXIuIFRoaXMgbWVhbnMgdGhhdCBpdFxuICogaXMgbm9uLW5lZ2F0aXZlLiBJdCBoYXMgbm8gZnJhY3Rpb25hbCBjb21wb25lbnQgYW5kIHRoYXQgaXQgZG9lcyBub3RcbiAqIGV4Y2VlZCB0aGUgbWF4aW11bSBhbGxvd2VkIHZhbHVlLlxuICovXG5mdW5jdGlvbiB2ZXJpZnVpbnQgKHZhbHVlLCBtYXgpIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlID49IDAsICdzcGVjaWZpZWQgYSBuZWdhdGl2ZSB2YWx1ZSBmb3Igd3JpdGluZyBhbiB1bnNpZ25lZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBpcyBsYXJnZXIgdGhhbiBtYXhpbXVtIHZhbHVlIGZvciB0eXBlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZzaW50ICh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZJRUVFNzU0ICh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbn1cblxuZnVuY3Rpb24gYXNzZXJ0ICh0ZXN0LCBtZXNzYWdlKSB7XG4gIGlmICghdGVzdCkgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UgfHwgJ0ZhaWxlZCBhc3NlcnRpb24nKVxufVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9pbmRleC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlclwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbnZhciBsb29rdXAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG5cbjsoZnVuY3Rpb24gKGV4cG9ydHMpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG4gIHZhciBBcnIgPSAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKVxuICAgID8gVWludDhBcnJheVxuICAgIDogQXJyYXlcblxuXHR2YXIgUExVUyAgID0gJysnLmNoYXJDb2RlQXQoMClcblx0dmFyIFNMQVNIICA9ICcvJy5jaGFyQ29kZUF0KDApXG5cdHZhciBOVU1CRVIgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgTE9XRVIgID0gJ2EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFVQUEVSICA9ICdBJy5jaGFyQ29kZUF0KDApXG5cblx0ZnVuY3Rpb24gZGVjb2RlIChlbHQpIHtcblx0XHR2YXIgY29kZSA9IGVsdC5jaGFyQ29kZUF0KDApXG5cdFx0aWYgKGNvZGUgPT09IFBMVVMpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdGV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRleHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KHR5cGVvZiBleHBvcnRzID09PSAndW5kZWZpbmVkJyA/ICh0aGlzLmJhc2U2NGpzID0ge30pIDogZXhwb3J0cykpXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9iYXNlNjQtanMvbGliL2I2NC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYlwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbmV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXTtcblxuICBpICs9IGQ7XG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIHMgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBlTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgZSA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IG1MZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhcztcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpO1xuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbik7XG4gICAgZSA9IGUgLSBlQmlhcztcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKTtcbn07XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDA7XG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSk7XG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDA7XG4gICAgZSA9IGVNYXg7XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLTtcbiAgICAgIGMgKj0gMjtcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKys7XG4gICAgICBjIC89IDI7XG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMDtcbiAgICAgIGUgPSBlTWF4O1xuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSBlICsgZUJpYXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSAwO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpO1xuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG07XG4gIGVMZW4gKz0gbUxlbjtcbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KTtcblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjg7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NFwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcbi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnByb2Nlc3MubmV4dFRpY2sgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBjYW5TZXRJbW1lZGlhdGUgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5zZXRJbW1lZGlhdGU7XG4gICAgdmFyIGNhblBvc3QgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5wb3N0TWVzc2FnZSAmJiB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lclxuICAgIDtcblxuICAgIGlmIChjYW5TZXRJbW1lZGlhdGUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmKSB7IHJldHVybiB3aW5kb3cuc2V0SW1tZWRpYXRlKGYpIH07XG4gICAgfVxuXG4gICAgaWYgKGNhblBvc3QpIHtcbiAgICAgICAgdmFyIHF1ZXVlID0gW107XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gZXYuc291cmNlO1xuICAgICAgICAgICAgaWYgKChzb3VyY2UgPT09IHdpbmRvdyB8fCBzb3VyY2UgPT09IG51bGwpICYmIGV2LmRhdGEgPT09ICdwcm9jZXNzLXRpY2snKSB7XG4gICAgICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoJ3Byb2Nlc3MtdGljaycsICcqJyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgIH07XG59KSgpO1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn1cblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3NcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIENvbnRyb2xsZXIgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvY29udHJvbGxlcicpO1xudmFyIE1vZGFsVmlldyA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2FwcC92aWV3cy9hcHBsaWNhdGlvbi9tb2RhbCcpO1xuXG5mdW5jdGlvbiBNb2RhbENvbnRyb2xsZXIoJGVsZW1lbnQpe1xuXG4gICAgdmFyICR3aW5kb3cgPSAkKHdpbmRvdyksXG4gICAgICAgICRib2R5ID0gJCgnYm9keScpLFxuICAgICAgICAkZG9jdW1lbnQgPSAkKGRvY3VtZW50KSxcbiAgICAgICAgaW5zdGFuY2UgPSBNb2RhbENvbnRyb2xsZXIucHJvdG90eXBlLmNyZWF0ZSh7IHZpZXcgOiBNb2RhbFZpZXcoKSB9KTtcblxuICAgICRlbGVtZW50LmFwcGVuZChpbnN0YW5jZS52aWV3LnJlbmRlcigpKTtcbiAgICAkZWxlbWVudC5oaWRlKCkuY2hpbGRyZW4oKS5oaWRlKCk7XG4gICAgaW5zdGFuY2Uudmlldy5yb290ID0gJGVsZW1lbnQ7XG4gICAgJGJvZHkuYXBwZW5kKCRlbGVtZW50KTtcblxuICAgIGluc3RhbmNlLmhhbmRsZXJzID0ge1xuICAgICAgICBjbG9zZSA6ICRlbGVtZW50Lm9uKCdjbGljaycsICcubW9kYWwtb3ZlcmxheSwgLmNsb3NlJywgZnVuY3Rpb24oKXsgaW5zdGFuY2UuY2xvc2UoKTsgfSksXG4gICAgICAgIGVzY2FwZSA6ICRkb2N1bWVudC5vbigna2V5dXAnLCBmdW5jdGlvbihlKXsgaWYgKGUua2V5Q29kZSA9PT0gMjcpIGluc3RhbmNlLmNsb3NlKCk7IH0pLFxuICAgICAgICByZXNpemU6ICR3aW5kb3cuYWRkKCRib2R5KS5vbigncmVzaXplIHNjcm9sbCcsIF8udGhyb3R0bGUoZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHZhciAkdyA9IGluc3RhbmNlLnZpZXcud2luZG93O1xuICAgICAgICAgICAgJGVsZW1lbnQuY3NzKHtcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6ICR3aW5kb3cuaW5uZXJXaWR0aCgpLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6ICQoZG9jdW1lbnQpLmlubmVySGVpZ2h0KClcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICR3LmNzcyh7XG4gICAgICAgICAgICAgICAgJ21hcmdpbi1sZWZ0JyA6IC0kdy53aWR0aCgpLzIsXG4gICAgICAgICAgICAgICAgJ21hcmdpbi10b3AnIDogLSR3LmhlaWdodCgpLzJcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCA1MDApKVxuICAgIH07XG5cbiAgICByZXR1cm4gaW5zdGFuY2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ29udHJvbGxlci5wcm90b3R5cGUuZXh0ZW5kKCBDb250cm9sbGVyLCBNb2RhbENvbnRyb2xsZXIsIHtcbiAgICAvKipcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IHByb21pc2VcbiAgICAgKi9cbiAgICBjbG9zZSA6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHZhciB2aWV3ID0gdGhpcy52aWV3O1xuICAgICAgICB2YXIgZWxlbSA9IHRoaXMudmlldy5yb290O1xuICAgICAgICB2YXIgcHJvbWlzZSA9ICQud2hlbiggdmlldy53aW5kb3cuaGlkZSgpLnByb21pc2UoKSwgdmlldy5vdmVybGF5LmhpZGUoKS5wcm9taXNlKCkgKTtcbiAgICAgICAgcmV0dXJuIHByb21pc2UuZG9uZShmdW5jdGlvbih3aW4pe1xuICAgICAgICAgICAgd2luLmNoaWxkcmVuKCcubW9kYWwtY29udGVudHMnKS5lbXB0eSgpO1xuICAgICAgICAgICAgZWxlbS5oaWRlKCk7XG4gICAgICAgIH0pO1xuICAgIH0sXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBwcm9taXNlXG4gICAgICovXG4gICAgc2hvdzogZnVuY3Rpb24oY29udGVudCl7XG4gICAgICAgIHZhciB2aWV3ID0gdGhpcy52aWV3O1xuICAgICAgICB2YXIgcG9wdXAgPSB2aWV3LndpbmRvdztcbiAgICAgICAgdGhpcy52aWV3LnJvb3Quc2hvdygpO1xuXG4gICAgICAgIHJldHVybiAkLndoZW4oIHZpZXcub3ZlcmxheS5zaG93KDEwKS5wcm9taXNlKCkgKS5kb25lKGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBwb3B1cC5jaGlsZHJlbignLm1vZGFsLWNvbnRlbnRzJykuYXBwZW5kKGNvbnRlbnQpO1xuICAgICAgICAgICAgcG9wdXAuc2hvdygpO1xuICAgICAgICAgICAgcG9wdXAuY3NzKHtcbiAgICAgICAgICAgICAgICAnbWluLWhlaWdodCcgOiBcIjFweFwiLFxuICAgICAgICAgICAgICAgICdtYXJnaW4tbGVmdCcgOiAtcG9wdXAud2lkdGgoKS8yLFxuICAgICAgICAgICAgICAgICdtYXJnaW4tdG9wJyA6IC1wb3B1cC5oZWlnaHQoKS8yXG4gICAgICAgICAgICB9KS5oZWlnaHQoOTAwKTtcbiAgICAgICAgfSk7XG4gICAgfVxufSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvY29udHJvbGxlcnMvbW9kYWxfY29udHJvbGxlci5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvY29udHJvbGxlcnNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIENvbnRyb2xsZXIgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvY29udHJvbGxlcicpO1xudmFyIFRhYmxlVmlldyA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2FwcC92aWV3cy9vYnNlcnZhdGlvbnMvdGFibGUnKTtcbi8qKlxuICpcbiAqIEBwYXJhbSB7alF1ZXJ5fSAkZWxlbVxuICogQHJldHVybnMge09ic2VydmF0aW9uc0NvbnRyb2xsZXJ9IGluc3RhbmNlXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gT2JzZXJ2YXRpb25zQ29udHJvbGxlcigkZWxlbSl7XG4gICAgcmV0dXJuIE9ic2VydmF0aW9uc0NvbnRyb2xsZXIucHJvdG90eXBlLmNyZWF0ZSh7XG4gICAgICAgIGVsZW1lbnQ6ICRlbGVtXG4gICAgfSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ29udHJvbGxlci5wcm90b3R5cGUuZXh0ZW5kKENvbnRyb2xsZXIsIE9ic2VydmF0aW9uc0NvbnRyb2xsZXIsIHtcbiAgICAvKipcbiAgICAgKiBHZXQgb2JzZXJ2YXRpb25zIGZvciBzdGF0aW9uLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfE51bWJlcn0gc3RhdGlvbklkXG4gICAgICogQHBhcmFtIHtWaWV3fSB2aWV3IC0gb3B0aW9uYWxcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBhIHByb21pc2VcbiAgICAgKi9cbiAgICBpbmRleDogZnVuY3Rpb24oc3RhdGlvbklkLCB2aWV3KXtcbiAgICAgICAgdmFyIGNvbnRyb2xsZXIgPSB0aGlzO1xuICAgICAgICB2YXIgdmlldyA9IHZpZXcgfHwgVGFibGVWaWV3KCk7XG4gICAgICAgIHZhciBwcm9taXNlID0gJC53aGVuKHRoaXMuY2xpZW50LmdldE9ic2VydmF0aW9ucyhzdGF0aW9uSWQpLCB0aGlzLmNsaWVudC5nZXRTdGF0aW9uKHN0YXRpb25JZCkpO1xuICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuKGZ1bmN0aW9uKG9ic2VydmF0aW9ucywgc3RhdGlvbil7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQ6IGNvbnRyb2xsZXIuZWxlbWVudCxcbiAgICAgICAgICAgICAgICB2aWV3OiB2aWV3LFxuICAgICAgICAgICAgICAgIHJlbmRlcmVkOiB2aWV3LnJlbmRlcih7XG4gICAgICAgICAgICAgICAgICAgIG9ic2VydmF0aW9uczogb2JzZXJ2YXRpb25zLFxuICAgICAgICAgICAgICAgICAgICBzdGF0aW9uOiBzdGF0aW9uXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgb2JzZXJ2YXRpb25zOiBvYnNlcnZhdGlvbnMsXG4gICAgICAgICAgICAgICAgc3RhdGlvbjogc3RhdGlvblxuICAgICAgICAgICAgfVxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKHN0YXRlKXtcbiAgICAgICAgICAgIGNvbnRyb2xsZXIuZWxlbWVudC5lbXB0eSgpO1xuICAgICAgICAgICAgY29udHJvbGxlci5lbGVtZW50LmFwcGVuZChzdGF0ZS5yZW5kZXJlZCk7XG4gICAgICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgICAgIH0pO1xuICAgIH1cbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL2NvbnRyb2xsZXJzL29ic2VydmF0aW9uc19jb250cm9sbGVyLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC9jb250cm9sbGVyc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgQ29udHJvbGxlciA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jb250cm9sbGVyJyk7XG52YXIgTWFwVmlldyA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2FwcC92aWV3cy9zdGF0aW9ucy9tYXAnKTtcblxuLyoqXG4gKlxuICogQHBhcmFtIHtqUXVlcnl9ICRlbGVtXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gU3RhdGlvbnNDb250cm9sbGVyKCRlbGVtKXtcbiAgIHJldHVybiBTdGF0aW9uc0NvbnRyb2xsZXIucHJvdG90eXBlLmNyZWF0ZSh7XG4gICAgICAgZWxlbWVudCA6ICRlbGVtXG4gICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDb250cm9sbGVyLnByb3RvdHlwZS5leHRlbmQoQ29udHJvbGxlciwgU3RhdGlvbnNDb250cm9sbGVyLCB7XG4gICAgLyoqXG4gICAgICogU2hvdyBhbGwgc3RhdGlvbnNcbiAgICAgKiBAcGFyYW0ge1ZpZXd9IHZpZXdcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBhIHByb21pc2VcbiAgICAgKi9cbiAgICBpbmRleCA6IGZ1bmN0aW9uKHZpZXcpIHtcbiAgICAgICAgdmFyIGNvbnRyb2xsZXIgPSB0aGlzO1xuICAgICAgICB2aWV3ID0gdmlldyB8fCBNYXBWaWV3KCk7XG4gICAgICAgIHJldHVybiAkLndoZW4odGhpcy5jbGllbnQuZ2V0U3RhdGlvbnMoKSlcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKHN0YXRpb25zKXtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiBjb250cm9sbGVyLmVsZW1lbnQsXG4gICAgICAgICAgICAgICAgICAgIHZpZXc6IHZpZXcsXG4gICAgICAgICAgICAgICAgICAgIHJlbmRlcmVkOiB2aWV3LnJlbmRlcih7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0aW9uczogc3RhdGlvbnNcbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICAgIHN0YXRpb25zOiBzdGF0aW9uc1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oc3RhdGUpe1xuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXIuZWxlbWVudC5lbXB0eSgpO1xuICAgICAgICAgICAgICAgIGNvbnRyb2xsZXIuZWxlbWVudC5hcHBlbmQoc3RhdGUucmVuZGVyZWQpO1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICAgICAgICAgIH0pO1xuICAgIH1cbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL2NvbnRyb2xsZXJzL3N0YXRpb25zX2NvbnRyb2xsZXIuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL2NvbnRyb2xsZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBNb2RlbCA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2ZyYW1ld29yay9tb2RlbCcpO1xuXG4vKipcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gYXR0cmlidXRlc1xuICogQHJldHVybnMge09ic2VydmF0aW9ufVxuICogQGNvbnN0cnVjdG9yIGRvZXMgbm90IG5lZWQgbmV3IGtleXdvZC5cbiAqL1xuZnVuY3Rpb24gT2JzZXJ2YXRpb24oYXR0cmlidXRlcyl7XG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IHtTdHJpbmd8TnVtYmVyfSBpZFxuICAgICAqIEBwcm9wZXJ0eSB7U3RyaW5nfE51bWJlcn0gc3RhdGlvbl9pZFxuICAgICAqIEBwcm9wZXJ0eSB7TnVtYmVyfSBzcGVlZCAobS9zKVxuICAgICAqIEBwcm9wZXJ0eSB7TnVtYmVyfSBkaXJlY3Rpb24gKGRlZ3JlZXMpXG4gICAgICogQHByb3BlcnR5IHtOdW1iZXJ9IG1heCAobS9zKVxuICAgICAqIEBwcm9wZXJ0eSB7TnVtYmVyfSBtaW4gKG0vcylcbiAgICAgKiBAcHJvcGVydHkge1N0cmluZ30gY3JlYXRlZF9hdCAtIElTTyA4NjAxIGNyZWF0ZWQgYXQgZGF0ZSBpbiBzdGF0aW9uIGxvY2FsIHRpbWVcbiAgICAgKiBAcHJvcGVydHkge1N0cmluZ30gY2FyZGluYWxcbiAgICAgKiBAcHJvcGVydHkge1N0cmluZ30gdHN0YW1wIC0gY3JlYXRlZF9hdCBhcyBhIFVUQyB1bml4IHRpbWVzdGFtcFxuICAgICAqL1xuICAgIGlmIChhdHRyaWJ1dGVzKSB7XG4gICAgICAgIGF0dHJpYnV0ZXMgPSBfLmV4dGVuZChhdHRyaWJ1dGVzLCB7XG4gICAgICAgICAgICBkYXRlOiBuZXcgRGF0ZShhdHRyaWJ1dGVzW1widHN0YW1wXCJdICogMTAwMCksXG4gICAgICAgICAgICBtYXg6IGF0dHJpYnV0ZXNbXCJtYXhfd2luZF9zcGVlZFwiXSxcbiAgICAgICAgICAgIG1pbjogYXR0cmlidXRlc1tcIm1pbl93aW5kX3NwZWVkXCJdXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBPYnNlcnZhdGlvbi5wcm90b3R5cGUuY3JlYXRlKGF0dHJpYnV0ZXMpO1xufVxuXG5Nb2RlbC5wcm90b3R5cGUuZXh0ZW5kKE1vZGVsLCBPYnNlcnZhdGlvbiwge1xuICAgIC8qKlxuICAgICAqIEZvcm1hdCBjcmVhdGVkIGF0IGRhdGUgd2l0aCBjbGllbnRzIGxvY2FsaXphdGlvbiBzZXR0aW5nc1xuICAgICAqIEBwYXJhbSB7QXJyYXl9IGxvY2FsZXNcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAgICAqL1xuICAgIGRhdGVUaW1lIDogZnVuY3Rpb24obG9jYWxlcyl7XG4gICAgICAgIC8vIERhdGUgdGFrZXMgVVRDIG1pbGxpc2Vjb25kc1xuICAgICAgICBpZiAodGhpcy5kYXRlKSByZXR1cm4gdGhpcy5kYXRlLnRvTG9jYWxlU3RyaW5nKGxvY2FsZXMpO1xuICAgIH0sXG4gICAgLyoqXG4gICAgICogSGVscGVyIG1ldGhvZCB0aGF0IGZvcm1hdHMgd2luZCBzcGVlZCBhY2NvcmRpbmcgdG8gYGF2ZyAobWluLW1heClgXG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgKi9cbiAgICB3aW5kU3BlZWQgOiBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4gXy50ZW1wbGF0ZSgnPCU9IHNwZWVkICU+JnRoaW5zcDsoPCU9IG1pbiAlPi08JT0gbWF4ICU+KSBtcycsIHRoaXMpO1xuICAgIH0sXG4gICAgLyoqXG4gICAgICogSGVscGVyIG1ldGhvZCB0aGF0IG91dHB1dHMgY29tcGFzcyBkaXJlY3Rpb24gYW5kIGRlZ3JlZXNcbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqL1xuICAgIGRlZ3JlZXNBbmRDYXJkaW5hbCA6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiBfLnRlbXBsYXRlKCc8JT0gY2FyZGluYWwgJT4mdGhpbnNwOyg8JT0gZGlyZWN0aW9uICU+wrApJywgdGhpcyk7XG4gICAgfVxufSk7XG5tb2R1bGUuZXhwb3J0cyA9IE9ic2VydmF0aW9uO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL21vZGVscy9vYnNlcnZhdGlvbi5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvbW9kZWxzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBNb2RlbCA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2ZyYW1ld29yay9tb2RlbCcpO1xudmFyIE9ic2VydmF0aW9uID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvYXBwL21vZGVscy9vYnNlcnZhdGlvbicpO1xuLyoqXG4gKiBAY29uc3RydWN0b3IgZG9lcyBub3QgcmVxdWlyZSB1c2Ugb2YgYG5ld2Aga2V5d29yZC5cbiAqL1xuZnVuY3Rpb24gU3RhdGlvbihhdHRyaWJ1dGVzKXtcbiAgICBpZiAoYXR0cmlidXRlcykge1xuICAgICAgICBhdHRyaWJ1dGVzID1fLmV4dGVuZChhdHRyaWJ1dGVzLCB7XG4gICAgICAgICAgICBsYXRlc3RPYnNlcnZhdGlvbjogYXR0cmlidXRlc1tcImxhdGVzdF9vYnNlcnZhdGlvblwiXSA/IE9ic2VydmF0aW9uKGF0dHJpYnV0ZXNbXCJsYXRlc3Rfb2JzZXJ2YXRpb25cIl1bXCJvYnNlcnZhdGlvblwiXSkgOiBudWxsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBcInN1cGVyXCIgY29uc3RydWN0b3IgY2FsbFxuICAgIHJldHVybiBTdGF0aW9uLnByb3RvdHlwZS5jcmVhdGUoYXR0cmlidXRlcyk7XG59XG5cbk1vZGVsLnByb3RvdHlwZS5leHRlbmQoTW9kZWwsIFN0YXRpb24sIHtcbiAgICAvKipcbiAgICAgKiBPdmVycmlkZXMgT2JqZWN0LnRvU3RyaW5nIG1ldGhvZCB0byBvdXRwdXQgdGhlIG5hbWUgb2YgdGhlIHN0YXRpb25cbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAgICAqL1xuICAgIHRvU3RyaW5nIDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLm9mZmxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm5hbWUgKyAnIDxicj4gJyArICdPZmZsaW5lJ1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMubGF0ZXN0T2JzZXJ2YXRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm5hbWUgKyAnIDxicj4gJyArIHRoaXMubGF0ZXN0T2JzZXJ2YXRpb24ud2luZFNwZWVkKCk7XG4gICAgICAgIH1cbiAgICB9XG59KTtcbm1vZHVsZS5leHBvcnRzID0gU3RhdGlvbjtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC9tb2RlbHMvc3RhdGlvbi5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvbW9kZWxzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBWaWV3ID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL3ZpZXcnKTtcblxuLyoqXG4gKlxuICogQHJldHVybnMge01vZGFsVmlld31cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBNb2RhbFZpZXcoKXtcbiAgICByZXR1cm4gTW9kYWxWaWV3LnByb3RvdHlwZS5jcmVhdGUoe1xuICAgICAgICB0ZW1wbGF0ZSA6IF8udGVtcGxhdGUoXG4gICAgICAgICAgICAnPGRpdiBjbGFzcz1cIm1vZGFsLW92ZXJsYXlcIj48L2Rpdj4nK1xuICAgICAgICAgICAgJzxkaXYgY2xhc3M9XCJtb2RhbC13aW5kb3dcIj4nICtcbiAgICAgICAgICAgICAgICAnPGRpdiBjbGFzcz1cIm1vZGFsLWNvbnRlbnRzXCI+PC9kaXY+JyArXG4gICAgICAgICAgICAgICAgJzxidXR0b24gY2xhc3M9XCJjbG9zZVwiPjwlPSB0aGlzLnRyYW5zLmNsb3NlICU+PC9idXR0b24+JyArXG4gICAgICAgICAgICAnPC9kaXY+J1xuICAgICAgICApLFxuICAgICAgICBkZWZhdWx0VHJhbnNsYXRpb25zIDoge1xuICAgICAgICAgICAgY2xvc2U6IFwiQ2xvc2VcIlxuICAgICAgICB9LFxuICAgICAgICBhZnRlclJlbmRlciA6IGZ1bmN0aW9uKHJlbmRlcmVkKSB7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnQgPSByZW5kZXJlZDtcbiAgICAgICAgICAgIHRoaXMud2luZG93ID0gcmVuZGVyZWQuZmlsdGVyKCcubW9kYWwtd2luZG93JykuaGlkZSgpO1xuICAgICAgICAgICAgdGhpcy5vdmVybGF5ID0gcmVuZGVyZWQuZmlsdGVyKCcubW9kYWwtb3ZlcmxheScpLmhpZGUoKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFZpZXcucHJvdG90eXBlLmV4dGVuZChWaWV3LCBNb2RhbFZpZXcpO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL3ZpZXdzL2FwcGxpY2F0aW9uL21vZGFsLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC92aWV3cy9hcHBsaWNhdGlvblwiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgVmlldyA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2ZyYW1ld29yay92aWV3Jyk7XG4vKipcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gVGFibGVWaWV3KG9wdGlvbnMpe1xuICAgIG9wdGlvbnMgPSBfLmRlZmF1bHRzKG9wdGlvbnMgfHwge30sIHtcbiAgICAgICAgcGVyX3BhZ2U6IDIwXG4gICAgfSk7XG4gICAgLyoqXG4gICAgICogQmluZCBldmVudCBoYW5kbGVycyBmb3IgcGFnaW5hdGlvblxuICAgICAqIEBwYXJhbSB7alF1ZXJ5fSB0ZW1wbGF0ZVxuICAgICAqIEByZXR1cm5zIHtqUXVlcnl9XG4gICAgICovXG4gICAgZnVuY3Rpb24gcGFnaW5hdGUodGVtcGxhdGUsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG9ic2VydmF0aW9ucyA9IHRlbXBsYXRlLmZpbmQoJy5vYnNlcnZhdGlvbicpO1xuICAgICAgICB2YXIgcGFnaW5hdGlvbiA9IHRlbXBsYXRlLmZpbmQoJy5wYWdpbmF0aW9uJyk7XG4gICAgICAgIHZhciBwZXJfcGFnZSA9IG9wdGlvbnMucGVyX3BhZ2U7XG5cbiAgICAgICAgLy8gYWRkIHBhZ2UgY2xhc3Nlc1xuICAgICAgICBvYnNlcnZhdGlvbnMuZWFjaChmdW5jdGlvbihpKXtcbiAgICAgICAgICAgICQodGhpcykuYWRkQ2xhc3MoJ3BhZ2UtJyArIE1hdGguZmxvb3IoaS9wZXJfcGFnZSArIDEpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIE1hcmsgZmlyc3QgcGFnZSBhcyBhY3RpdmVcbiAgICAgICAgdGVtcGxhdGUuZmluZCgnLnBhZ2luYXRpb24gbGk6Zmlyc3QnKS5hZGRDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgIHRlbXBsYXRlLmZpbmQoJy5vYnNlcnZhdGlvbjpub3QoLnBhZ2UtMSknKS5hZGRDbGFzcygnaGlkZGVuJyk7XG5cbiAgICAgICAgLy8gd2hlbiBjbGlja2luZyBhIHBhZ2UgbnVtYmVyXG4gICAgICAgIHBhZ2luYXRpb24ub24oJ2NsaWNrJywgJy5wYWdlJywgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHZhciBvbl9wYWdlID0gJCh0aGlzKS5hdHRyKCdocmVmJykucmVwbGFjZSgnIycsICcuJyk7XG4gICAgICAgICAgICBwYWdpbmF0aW9uLmZpbmQoJ2xpJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgJCh0aGlzKS5wYXJlbnQoKS5hZGRDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICBvYnNlcnZhdGlvbnMuZmlsdGVyKG9uX3BhZ2UpLnJlbW92ZUNsYXNzKCdoaWRkZW4nKTtcbiAgICAgICAgICAgIG9ic2VydmF0aW9ucy5ub3Qob25fcGFnZSkuYWRkQ2xhc3MoJ2hpZGRlbicpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRlbXBsYXRlO1xuICAgIH1cblxuICAgIHJldHVybiBUYWJsZVZpZXcucHJvdG90eXBlLmNyZWF0ZSh7XG4gICAgICAgIG9wdGlvbnM6IG9wdGlvbnMsXG4gICAgICAgIHJlbmRlcjogZnVuY3Rpb24odmlld19kYXRhKXtcbiAgICAgICAgICAgIHZhciBwZXJfcGFnZSA9IHRoaXMub3B0aW9ucy5wZXJfcGFnZTtcbiAgICAgICAgICAgIHZpZXdfZGF0YSA9IF8uZGVmYXVsdHModmlld19kYXRhLCB7XG4gICAgICAgICAgICAgICAgcGVyX3BhZ2U6IHBlcl9wYWdlLFxuICAgICAgICAgICAgICAgIHBhZ2VzOiBNYXRoLmNlaWwodmlld19kYXRhLm9ic2VydmF0aW9ucy5sZW5ndGggLyBwZXJfcGFnZSlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHBhZ2luYXRlKCBUYWJsZVZpZXcucHJvdG90eXBlLnJlbmRlcih2aWV3X2RhdGEpLCBvcHRpb25zIClcbiAgICAgICAgfVxuICAgIH0pXG59XG5cbm1vZHVsZS5leHBvcnRzID0gVmlldy5wcm90b3R5cGUuZXh0ZW5kKFZpZXcsIFRhYmxlVmlldywge1xuICAgIGRlZmF1bHRUcmFuc2xhdGlvbnM6IHtcbiAgICAgICAgY3JlYXRlZF9hdDogJ1RpbWUnLFxuICAgICAgICBzcGVlZDogJ1dpbmQgc3BlZWQnLFxuICAgICAgICBkaXJlY3Rpb246ICdEaXJlY3Rpb24nXG4gICAgfSxcbiAgICB0ZW1wbGF0ZTogXy50ZW1wbGF0ZShcbiAgICAgICAgJzx0YWJsZT4nICtcbiAgICAgICAgICAgICc8bGVnZW5kIGNsYXNzPVwic3RhdGlvbi1uYW1lXCI+PCU9IHRoaXMuc3RhdGlvbi5uYW1lICU+PC9sZWdlbmQ+JyArXG4gICAgICAgICAgICAnPHRoZWFkPicgK1xuICAgICAgICAgICAgICAgICc8dHI+JyArXG4gICAgICAgICAgICAgICAgICAgICc8dGQ+PCU9IHQuY3JlYXRlZF9hdCAlPjwvdGQ+JyArXG4gICAgICAgICAgICAgICAgICAgICc8dGQ+PCU9IHQuc3BlZWQgJT48L3RkPicgK1xuICAgICAgICAgICAgICAgICAgICAnPHRkPjwlPSB0LmRpcmVjdGlvbiAlPjwvdGQ+JyArXG4gICAgICAgICAgICAgICAgJzwvdHI+JyArXG4gICAgICAgICAgICAnPC90aGVhZD4nICtcbiAgICAgICAgICAgICc8dGJvZHk+JyArXG4gICAgICAgICAgICAgICAgJzwlIF8uZWFjaCh0aGlzLm9ic2VydmF0aW9ucywgZnVuY3Rpb24ob2JzLCBpbmRleCkgeyAlPicgK1xuICAgICAgICAgICAgICAgICc8dHIgY2xhc3M9XCJvYnNlcnZhdGlvblwiID4nICtcbiAgICAgICAgICAgICAgICAgICAgXCI8dGQgY2xhc3M9J2NyZWF0ZWQtYXQnPjwlPSBvYnMuZGF0ZVRpbWUoKSAlPjwvdGQ+XCIgK1xuICAgICAgICAgICAgICAgICAgICBcIjx0ZCBjbGFzcz0nd2luZC1zcGVlZCc+PCU9IG9icy53aW5kU3BlZWQoKSAlPjwvdGQ+XCIgK1xuICAgICAgICAgICAgICAgICAgICBcIjx0ZCBjbGFzcz0nZGlyZWN0aW9uJz48JT0gb2JzLmRlZ3JlZXNBbmRDYXJkaW5hbCgpICU+PC90ZD5cIiArXG4gICAgICAgICAgICAgICAgJzwvdHI+JytcbiAgICAgICAgICAgICAgICAnPCUgfSk7ICU+JyArXG4gICAgICAgICAgICAnPC90Ym9keT4nICtcbiAgICAgICAgJzwvdGFibGU+JyArXG4gICAgICAgICc8bmF2IGNsYXNzPVwicGFnZXNcIj4nICtcbiAgICAgICAgICAgICc8dWwgY2xhc3M9XCJwYWdpbmF0aW9uXCI+JyArXG4gICAgICAgICAgICAnPCUgXy50aW1lcyh0aGlzLnBhZ2VzLCBmdW5jdGlvbihwYWdlKXsgcGFnZSsrOyAlPicgK1xuICAgICAgICAgICAgICAgICc8bGk+PGEgY2xhc3M9XCJwYWdlXCIgaHJlZj1cIiNwYWdlLTwlPSBwYWdlICU+XCI+PCU9IHBhZ2UgJT48L2E+PC9saT4nICtcbiAgICAgICAgICAgICc8JSB9KTsgJT4nICtcbiAgICAgICAgICAgICc8L3VsPicgK1xuICAgICAgICAnPC9uYXY+J1xuICAgIClcbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL3ZpZXdzL29ic2VydmF0aW9ucy90YWJsZS5qc1wiLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvdmlld3Mvb2JzZXJ2YXRpb25zXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBWaWV3ID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL3ZpZXcnKTtcblxuLyoqXG4gKiBAcmV0dXJucyB7TWFwVmlld31cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBNYXBWaWV3KGdvb2dsZSl7XG4gICAgcmV0dXJuIE1hcFZpZXcucHJvdG90eXBlLmNyZWF0ZShmdW5jdGlvbihpbnN0YW5jZSl7XG4gICAgICAgIGlmIChnb29nbGUpIHtcbiAgICAgICAgICAgIGluc3RhbmNlLmdtYXBzID0gZ29vZ2xlLm1hcHM7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBWaWV3LnByb3RvdHlwZS5leHRlbmQoVmlldywgTWFwVmlldywge1xuICAgIGRlZmF1bHRUcmFuc2xhdGlvbnMgOiB7XG4gICAgICAgIHNob3dfYWxsIDogXCJTaG93IGFsbFwiXG4gICAgfSxcbiAgICBzZXRHbWFwcyA6IGZ1bmN0aW9uKGdvb2dsZV9tYXBzKXtcbiAgICAgIHRoaXMuZ21hcHMgPSBnb29nbGVfbWFwcztcbiAgICB9LFxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtGdW5jdGlvbn1cbiAgICAgKi9cbiAgICB0ZW1wbGF0ZSA6IF8udGVtcGxhdGUoXG4gICAgICAgICc8ZGl2IGNsYXNzPVwiY29udHJvbHNcIj4nICtcbiAgICAgICAgICAgICc8YnV0dG9uIGNsYXNzPVwidGlueVwiIGlkPVwic2hvdy1hbGwtbWFya2Vyc1wiPjwlPSB0LnNob3dfYWxsICU+PC9idXR0b24+JyArXG4gICAgICAgICc8L2Rpdj4nXG4gICAgKSxcbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGEgbmV3IGdvb2dsZS5tYXBzLk1hcFxuICAgICAqIEBzZWUgaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vbWFwcy9kb2N1bWVudGF0aW9uL2phdmFzY3JpcHQvcmVmZXJlbmNlI01hcFxuICAgICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsZW1lbnRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gbWFwT3B0aW9ucyBzZWUgZ29vZ2xlLm1hcHMuTWFwT3B0aW9ucyBmb3IgdmFsaWQgb3B0aW9uc1xuICAgICAqKi9cbiAgICBjcmVhdGVNYXA6IGZ1bmN0aW9uKGVsZW1lbnQsIG1hcE9wdGlvbnMpe1xuICAgICAgICB2YXIgZ21hcHMgPSBnbG9iYWwuZ29vZ2xlLm1hcHM7XG5cbiAgICAgICAgaWYgKGVsZW1lbnQuanF1ZXJ5KSB7XG4gICAgICAgICAgICBlbGVtZW50ID0gZWxlbWVudFswXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IGdtYXBzLk1hcChlbGVtZW50LCBfLmRlZmF1bHRzKG1hcE9wdGlvbnMgfHwge30sIHtcbiAgICAgICAgICAgIGNlbnRlcjogbmV3IGdtYXBzLkxhdExuZyg2My4zOTkzMTMsIDEzLjA4MjIzNiksXG4gICAgICAgICAgICB6b29tOiAxMCxcbiAgICAgICAgICAgIG1hcFR5cGVJZDogZ21hcHMuTWFwVHlwZUlkLlJPQURNQVBcbiAgICAgICAgfSkpO1xuICAgIH0sXG4gICAgLyoqXG4gICAgICogVXBkYXRlIG1hcCB3aXRoIG5ldyBtYXJrZXJzLlxuICAgICAqIFRoaXMgZGVsZXRlcyBhbnkgZXhpc3RpbmcgbWFya2VycyBhbmQgcmVzZXRzIHRoZSBib3VuZHMgYW5kIHpvb20gb2YgdGhlIG1hcC5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZGF0YVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IG9uQ2xpY2sgLSBjYWxsYmFjayBmdW5jdGlvbiB3aGVuIG1hcmtlciBpcyBjbGlja2VkXG4gICAgICogQHJldHVybnMge09iamVjdH0gZGF0YVxuICAgICAqL1xuICAgIHVwZGF0ZU1hcDogZnVuY3Rpb24gKGRhdGEsIG9uQ2xpY2spIHtcbiAgICAgICAgdmFyIG1hcCA9IGRhdGEubWFwO1xuICAgICAgICB2YXIgbWFya2VycztcbiAgICAgICAgdmFyIGdtYXBzID0gZ2xvYmFsLmdvb2dsZS5tYXBzO1xuXG4gICAgICAgIHZhciBJY29uID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvbWFwcy9pY29uJyk7XG4gICAgICAgIGZ1bmN0aW9uIExhYmVsKG9wdF9vcHRpb25zKXtcbiAgICAgICAgICAgIC8vIEluaXRpYWxpemF0aW9uXG4gICAgICAgICAgICB0aGlzLnNldFZhbHVlcyhvcHRfb3B0aW9ucyk7XG4gICAgICAgICAgICAvLyBMYWJlbCBzcGVjaWZpY1xuICAgICAgICAgICAgdGhpcy5zcGFuXyA9ICQoJzxzcGFuIGNsYXNzPVwibWFwLWxhYmVsLWlubmVyXCI+JylbMF07XG4gICAgICAgICAgICB0aGlzLmRpdl8gPSAkKCc8ZGl2IGNsYXNzPVwibWFwLWxhYmVsLW91dGVyXCIgc3R5bGU9XCJwb3NpdGlvbjogYWJzb2x1dGU7IGRpc3BsYXk6IG5vbmVcIj4nKVswXTtcbiAgICAgICAgICAgIHRoaXMuZGl2Xy5hcHBlbmRDaGlsZCh0aGlzLnNwYW5fKTtcbiAgICAgICAgfVxuLy9ub2luc3BlY3Rpb24gSlNVbnVzZWRHbG9iYWxTeW1ib2xzXG4gICAgICAgIExhYmVsLnByb3RvdHlwZSA9IF8uZXh0ZW5kKG5ldyBnbG9iYWwuZ29vZ2xlLm1hcHMuT3ZlcmxheVZpZXcsIHtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogSW1wbGVtZW50IHRoaXMgbWV0aG9kIHRvIGluaXRpYWxpemUgdGhlIG92ZXJsYXkgRE9NIGVsZW1lbnRzLlxuICAgICAgICAgICAgICogVGhpcyBtZXRob2QgaXMgY2FsbGVkIG9uY2UgYWZ0ZXIgc2V0TWFwKCkgaXMgY2FsbGVkIHdpdGggYSB2YWxpZCBtYXAuXG4gICAgICAgICAgICAgKiBBdCB0aGlzIHBvaW50LCBwYW5lcyBhbmQgcHJvamVjdGlvbiB3aWxsIGhhdmUgYmVlbiBpbml0aWFsaXplZC5cbiAgICAgICAgICAgICAqIEByZXR1cm5zIHt2b2lkfVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBvbkFkZCA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgdmFyIGxhYmVsID0gdGhpcztcbiAgICAgICAgICAgICAgICB0aGlzLmdldFBhbmVzKCkub3ZlcmxheUxheWVyLmFwcGVuZENoaWxkKHRoaXMuZGl2Xyk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBJbXBsZW1lbnQgdGhpcyBtZXRob2QgdG8gcmVtb3ZlIHlvdXIgZWxlbWVudHMgZnJvbSB0aGUgRE9NLlxuICAgICAgICAgICAgICogVGhpcyBtZXRob2QgaXMgY2FsbGVkIG9uY2UgZm9sbG93aW5nIGEgY2FsbCB0byBzZXRNYXAobnVsbCkuXG4gICAgICAgICAgICAgKiBAcmV0dXJucyB7dm9pZH1cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgb25SZW1vdmUgOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRpdl8ucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLmRpdl8pO1xuICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBhbGwgbGlzdGVuZXJzXG4gICAgICAgICAgICAgICAgLy9ub2luc3BlY3Rpb24gSlNVbnVzZWRHbG9iYWxTeW1ib2xzXG4gICAgICAgICAgICAgICAgdGhpcy5saXN0ZW5lcnNfID0gXy5maWx0ZXIoZnVuY3Rpb24obGlzdGVuZXIpe1xuICAgICAgICAgICAgICAgICAgICBnbWFwcy5ldmVudC5yZW1vdmVMaXN0ZW5lcihsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEltcGxlbWVudCB0aGlzIG1ldGhvZCB0byBkcmF3IG9yIHVwZGF0ZSB0aGUgb3ZlcmxheS5cbiAgICAgICAgICAgICAqIFRoaXMgbWV0aG9kIGlzIGNhbGxlZCBhZnRlciBvbkFkZCgpIGFuZCB3aGVuIHRoZSBwb3NpdGlvbiBmcm9tIHByb2plY3Rpb24uZnJvbUxhdExuZ1RvUGl4ZWwoKVxuICAgICAgICAgICAgICogd291bGQgcmV0dXJuIGEgbmV3IHZhbHVlIGZvciBhIGdpdmVuIExhdExuZy4gVGhpcyBjYW4gaGFwcGVuIG9uIGNoYW5nZSBvZiB6b29tLCBjZW50ZXIsIG9yIG1hcCB0eXBlLlxuICAgICAgICAgICAgICogSXQgaXMgbm90IG5lY2Vzc2FyaWx5IGNhbGxlZCBvbiBkcmFnIG9yIHJlc2l6ZS5cbiAgICAgICAgICAgICAqIEByZXR1cm5zIHt2b2lkfVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBkcmF3IDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBvc2l0aW9uID0gdGhpcy5nZXRQcm9qZWN0aW9uKCkuZnJvbUxhdExuZ1RvRGl2UGl4ZWwodGhpcy5nZXQoJ3Bvc2l0aW9uJykpO1xuICAgICAgICAgICAgICAgIHRoaXMuc3Bhbl8uaW5uZXJIVE1MID0gdGhpcy5nZXQoJ3RleHQnKTtcbiAgICAgICAgICAgICAgICAkKHRoaXMuZGl2XykuY3NzKHtcbiAgICAgICAgICAgICAgICAgICAgbGVmdCA6IHBvc2l0aW9uLnggKyAncHgnLFxuICAgICAgICAgICAgICAgICAgICB0b3A6IHBvc2l0aW9uLnkgKyAncHgnLFxuICAgICAgICAgICAgICAgICAgICBkaXNwbGF5IDogJ2Jsb2NrJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IExhYmVsO1xuXG4gICAgICAgIC8vIENyZWF0ZSBhIGZyZXNoIGJvdW5kcyBvYmplY3RcbiAgICAgICAgbWFwLmJvdW5kcyA9IG5ldyBnb29nbGUubWFwcy5MYXRMbmdCb3VuZHMoKTtcbiAgICAgICAgLy8gRGVsZXRlIGFueSBleGlzdGluZyBtYXJrZXJzIHRvIGF2b2lkIGR1cGxpY2F0ZXNcbiAgICAgICAgaWYgKF8uaXNBcnJheShkYXRhLm1hcmtlcnMpKSB7XG4gICAgICAgICAgICBkYXRhLm1hcmtlcnMgPSBfLmZpbHRlcihkYXRhLm1hcmtlcnMsIGZ1bmN0aW9uKG1hcmtlcil7XG4gICAgICAgICAgICAgICAgbWFya2VyLnNldE1hcChudWxsKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBtYXJrZXJzID0gXy5tYXAoZGF0YS5zdGF0aW9ucywgZnVuY3Rpb24oc3RhdGlvbil7XG4gICAgICAgICAgICByZXR1cm4gbmV3IGdtYXBzLk1hcmtlcih7XG4gICAgICAgICAgICAgICAgcG9zaXRpb246IG5ldyBnbWFwcy5MYXRMbmcoc3RhdGlvbi5sYXRpdHVkZSwgc3RhdGlvbi5sb25naXR1ZGUpLFxuICAgICAgICAgICAgICAgIHRpdGxlOiBzdGF0aW9uLm5hbWUsXG4gICAgICAgICAgICAgICAgbWFwOiBtYXAsXG4gICAgICAgICAgICAgICAgaWNvbjogbmV3IEljb24oc3RhdGlvbiksXG4gICAgICAgICAgICAgICAgaWQ6IHN0YXRpb24uaWQsXG4gICAgICAgICAgICAgICAgc3RhdGlvbjogc3RhdGlvbixcbiAgICAgICAgICAgICAgICBsYWJlbDogbmV3IExhYmVsKHtcbiAgICAgICAgICAgICAgICAgICAgbWFwOiBtYXAsXG4gICAgICAgICAgICAgICAgICAgIHRleHQ6IHN0YXRpb24udG9TdHJpbmcoKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIFNJREUgRUZGRUNUUyEhISEhXG4gICAgICAgIF8uZWFjaChtYXJrZXJzLCBmdW5jdGlvbihtYXJrZXIpe1xuICAgICAgICAgICAgbWFwLmJvdW5kcy5leHRlbmQobWFya2VyLnBvc2l0aW9uKTtcbiAgICAgICAgICAgbWFya2VyLmxhYmVsLmJpbmRUbygncG9zaXRpb24nLCBtYXJrZXIsICdwb3NpdGlvbicpO1xuICAgICAgICAgICAgaWYgKG9uQ2xpY2spIHtcbiAgICAgICAgICAgICAgICBnb29nbGUubWFwcy5ldmVudC5hZGRMaXN0ZW5lcihtYXJrZXIsICdjbGljaycsIG9uQ2xpY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgbWFwLmZpdEJvdW5kcyhtYXAuYm91bmRzKTtcbiAgICAgICAgcmV0dXJuIF8uZXh0ZW5kKGRhdGEsIHtcbiAgICAgICAgICAgIG1hcmtlcnM6IG1hcmtlcnNcbiAgICAgICAgfSk7XG4gICAgfVxufSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvdmlld3Mvc3RhdGlvbnMvbWFwLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC92aWV3cy9zdGF0aW9uc1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgV2lkZ2V0ID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL3dpZGdldCcpO1xudmFyIFN0YXRpb25zQ29udHJvbGxlciA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2FwcC9jb250cm9sbGVycy9zdGF0aW9uc19jb250cm9sbGVyJyk7XG52YXIgTWFwVmlldyA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2FwcC92aWV3cy9zdGF0aW9ucy9tYXAnKTtcblxuLyoqXG4gKiBXaWRnZXQgdGhhdCBkaXNwbGF5cyB3aW5kIG9ic2VydmF0aW9ucyBpbiByZXZlcnNlIGNocm9ub2xvZ2ljYWwgb3JkZXJcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBNYXBXaWRnZXQoYXR0cnMpe1xuICAgIHJldHVybiBNYXBXaWRnZXQucHJvdG90eXBlLmNyZWF0ZShhdHRycyB8fCB7fSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gV2lkZ2V0LnByb3RvdHlwZS5leHRlbmQoV2lkZ2V0LCBNYXBXaWRnZXQsIHtcbiAgICBuYW1lOiBcIk1hcFdpZGdldFwiLFxuICAgIHNlbGVjdG9yOiAnLm1hcC13aWRnZXQnLFxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7alF1ZXJ5fSAkZWxlbVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfE51bWJlcn0gc3RhdGlvbklkXG4gICAgICogQHJldHVybnMge1RhYmxlV2lkZ2V0fVxuICAgICAqL1xuICAgIHN0YXJ0VXA6IGZ1bmN0aW9uKCRlbGVtLCBzdGF0aW9uSWQpe1xuICAgICAgICB2YXIgY29udHJvbGxlciA9IFN0YXRpb25zQ29udHJvbGxlcigkZWxlbSk7XG4gICAgICAgIHZhciBwcm9taXNlO1xuICAgICAgICB2YXIgYXBpTG9hZGVkID0galF1ZXJ5LkRlZmVycmVkKCk7XG4gICAgICAgIGpRdWVyeS5nZXRTY3JpcHQoJ2h0dHBzOi8vd3d3Lmdvb2dsZS5jb20vanNhcGknLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgZ29vZ2xlLmxvYWQoJ21hcHMnLCAnMycsIHsgb3RoZXJfcGFyYW1zOiAnc2Vuc29yPWZhbHNlJywgY2FsbGJhY2s6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgYXBpTG9hZGVkLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH19KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHByb21pc2UgPSAkLndoZW4oXG4gICAgICAgICAgICBhcGlMb2FkZWQsXG4gICAgICAgICAgICBjb250cm9sbGVyLmluZGV4KE1hcFZpZXcoKSlcbiAgICAgICAgKTtcbiAgICAgICAgcHJvbWlzZS5kb25lKGZ1bmN0aW9uKGFwaSwgc3RhdGUpe1xuICAgICAgICAgICAgdmFyIHZpZXcgPSBzdGF0ZS52aWV3O1xuICAgICAgICAgICAgc3RhdGUubWFwID0gdmlldy5jcmVhdGVNYXAoc3RhdGUuZWxlbWVudCk7XG4gICAgICAgICAgICB2aWV3LnVwZGF0ZU1hcChzdGF0ZSk7XG4gICAgICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gTWFwV2lkZ2V0KHtcbiAgICAgICAgICAgIGNvbnRyb2xsZXIgOiBjb250cm9sbGVyLFxuICAgICAgICAgICAgcHJvbWlzZSA6IHByb21pc2VcbiAgICAgICAgfSk7XG4gICAgfVxufSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvd2lkZ2V0cy9tYXBfd2lkZ2V0LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2FwcC93aWRnZXRzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBXaWRnZXQgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvd2lkZ2V0Jyk7XG52YXIgTW9kYWxDb250cm9sbGVyID0gIHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2FwcC9jb250cm9sbGVycy9tb2RhbF9jb250cm9sbGVyJyk7XG5cbi8qKlxuICogRGlzcGxheXMgY29udGVudCBpbiBhIFwicG9wdXBcIiB3aW5kb3cuXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gTW9kYWxXaWRnZXQoKXtcbiAgICByZXR1cm4gTW9kYWxXaWRnZXQucHJvdG90eXBlLmNyZWF0ZShmdW5jdGlvbihpbnN0YW5jZSl7IC8qKiBwcm9wZXJ0aWVzICoqLyB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBXaWRnZXQucHJvdG90eXBlLmV4dGVuZChXaWRnZXQsIE1vZGFsV2lkZ2V0LCB7XG4gICAgbmFtZTogXCJNb2RhbFdpZGdldFwiLFxuICAgIHNlbGVjdG9yOiAnLm1vZGFsLXdpZGdldCcsXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtqUXVlcnl9ICRlbGVtXG4gICAgICogQHJldHVybnMge01vZGFsV2lkZ2V0fVxuICAgICAqL1xuICAgIHN0YXJ0VXA6IGZ1bmN0aW9uKCRlbGVtKXtcbiAgICAgICAgcmV0dXJuIE1vZGFsV2lkZ2V0LnByb3RvdHlwZS5jcmVhdGUoe1xuICAgICAgICAgICAgY29udHJvbGxlciA6IE1vZGFsQ29udHJvbGxlcigkZWxlbSlcbiAgICAgICAgfSk7XG4gICAgfVxufSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvd2lkZ2V0cy9tb2RhbF93aWRnZXQuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL3dpZGdldHNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIFdpZGdldCA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2ZyYW1ld29yay93aWRnZXQnKTtcbnZhciBPYnNlcnZhdGlvbnNDb250cm9sbGVyID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvYXBwL2NvbnRyb2xsZXJzL29ic2VydmF0aW9uc19jb250cm9sbGVyJyk7XG52YXIgVGFibGVWaWV3ID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvYXBwL3ZpZXdzL29ic2VydmF0aW9ucy90YWJsZScpO1xuXG4vKipcbiAqIFdpZGdldCB0aGF0IGRpc3BsYXlzIHdpbmQgb2JzZXJ2YXRpb25zIGluIHJldmVyc2UgY2hyb25vbG9naWNhbCBvcmRlclxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIFRhYmxlV2lkZ2V0KGF0dHJzKXtcbiAgICByZXR1cm4gVGFibGVXaWRnZXQucHJvdG90eXBlLmNyZWF0ZShhdHRycyB8fCB7fSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gV2lkZ2V0LnByb3RvdHlwZS5leHRlbmQoV2lkZ2V0LCBUYWJsZVdpZGdldCwge1xuICAgIG5hbWU6IFwiVGFibGVXaWRnZXRcIixcbiAgICBzZWxlY3RvcjogJy50YWJsZS13aWRnZXQnLFxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7alF1ZXJ5fSAkZWxlbVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfE51bWJlcn0gc3RhdGlvbklkXG4gICAgICogQHJldHVybnMge1RhYmxlV2lkZ2V0fVxuICAgICAqL1xuICAgIHN0YXJ0VXA6IGZ1bmN0aW9uKCRlbGVtLCBzdGF0aW9uSWQpe1xuICAgICAgICB2YXIgY29udHJvbGxlciA9IE9ic2VydmF0aW9uc0NvbnRyb2xsZXIoJGVsZW0pO1xuICAgICAgICBzdGF0aW9uSWQgPSBzdGF0aW9uSWQgfHwgJGVsZW0uZGF0YSgnc3RhdGlvbklkJyk7XG5cbiAgICAgICAgcmV0dXJuIFRhYmxlV2lkZ2V0KHtcbiAgICAgICAgICAgIGNvbnRyb2xsZXIgOiBjb250cm9sbGVyLFxuICAgICAgICAgICAgcHJvbWlzZSA6IGNvbnRyb2xsZXIuaW5kZXgoc3RhdGlvbklkLCBUYWJsZVZpZXcoKSlcbiAgICAgICAgfSk7XG4gICAgfVxufSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9hcHAvd2lkZ2V0cy90YWJsZV93aWRnZXQuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvYXBwL3dpZGdldHNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIFN0YXRpb24gPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9hcHAvbW9kZWxzL3N0YXRpb24nKTtcbnZhciBPYnNlcnZhdGlvbiA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2FwcC9tb2RlbHMvb2JzZXJ2YXRpb24nKTtcbi8qKlxuICogQVBJIGNsaWVudCB0YWxrcyB0byB0aGUgYmxhc3QubnUganNvbiByZXN0IGFwaSB2aWEgYWpheC5cbiAqIFRoaXMgc2hvdWxkIGJlIHRoZSBPTkUgQU5EIE9OTFkgcG9pbnQgb2Ygb3V0c2lkZSBjb250YWN0LlxuICpcbiAqIEFsbCBtZXRob2RzIHJldHVybiBhIHByb21pc2VcbiAqIChhIHBsYWluIGphdmFzY3JpcHQgb2JqZWN0IHdpdGggaGFzIHRoZSBDb21tb24gSlMgUHJvbWlzZS9BIGludGVyZmFjZSlcbiAqXG4gKiBAc2VlIGh0dHA6Ly9hcGkuanF1ZXJ5LmNvbS9UeXBlcy8janFYSFJcbiAqIEBzZWUgaHR0cDovL3dpa2kuY29tbW9uanMub3JnL3dpa2kvUHJvbWlzZXNcbiAqXG4gKiBUaGUgQVBJIGNsaWVudCB0YWtlcyB0aGUgSlNPTiByZXNwb25zZSBhbmQgY29udmVydHMgdG8gbW9kZWxzIHRob3VnaCBwaXBpbmcuXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKiBAc2VlIGh0dHA6Ly93aWtpLmNvbW1vbmpzLm9yZy93aWtpL1Byb21pc2VzXG4gKi9cbmZ1bmN0aW9uIEFwaUNsaWVudCgpe1xuICAgIHZhciBiYXNlVXJsID0gKHdpbmRvdy5sb2NhdGlvbi5ob3N0ID09PSAnd3d3LmJsYXN0Lm51JykgPyAnJyA6ICdodHRwOi8vd3d3LmJsYXN0Lm51JztcbiAgICAvKipcbiAgICAgKiBHZXQgYWxsIHN0YXRpb25zXG4gICAgICogQHJldHVybnMge09iamVjdH0gYSBQcm9taXNlIG9iamVjdC5cbiAgICAgKi9cbiAgICB0aGlzLmdldFN0YXRpb25zID0gZnVuY3Rpb24oKXtcbiAgICAgICAgcmV0dXJuIGpRdWVyeS5hamF4KHtcbiAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICB1cmw6IGJhc2VVcmwgKyAnL3N0YXRpb25zLmpzb24nXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oZGF0YSl7XG4gICAgICAgICAgICByZXR1cm4gXy5tYXAoZGF0YSwgZnVuY3Rpb24ocyl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFN0YXRpb24ocyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvKipcbiAgICAgKiBHZXQgYSBzdGF0aW9uXG4gICAgICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSBpZCBjYW4gZWl0aGVyIGJlIGFuIGlkIG9yIGEgc2x1Z1xuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IGEgUHJvbWlzZSBvYmplY3RcbiAgICAgKi9cbiAgICB0aGlzLmdldFN0YXRpb24gPSBmdW5jdGlvbihpZCkge1xuICAgICAgICByZXR1cm4galF1ZXJ5LmFqYXgoe1xuICAgICAgICAgICAgZGF0YVR5cGU6ICdqc29uJyxcbiAgICAgICAgICAgIHVybDogYmFzZVVybCArICcvc3RhdGlvbnMvJWlkLmpzb24nLnJlcGxhY2UoJyVpZCcsIGlkKVxuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKGRhdGEpe1xuICAgICAgICAgICAgcmV0dXJuIFN0YXRpb24oZGF0YSk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLyoqXG4gICAgICogR2V0cyBvYnNlcnZhdGlvbnMgZm9yIGEgZ2l2ZW4gc3RhdGlvbi5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHN0YXRpb25faWQgY2FuIGVpdGhlciBiZSBhbiBpZCBvciBhIHNsdWdcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBhIFByb21pc2Ugb2JqZWN0XG4gICAgICovXG4gICAgdGhpcy5nZXRPYnNlcnZhdGlvbnMgPSBmdW5jdGlvbihzdGF0aW9uX2lkKXtcbiAgICAgICAgcmV0dXJuIGpRdWVyeS5hamF4KHtcbiAgICAgICAgICAgIGRhdGFUeXBlOiAnanNvbicsXG4gICAgICAgICAgICB1cmw6IGJhc2VVcmwgKyAnL3N0YXRpb25zLyVpZC9vYnNlcnZhdGlvbnMuanNvbicucmVwbGFjZSgnJWlkJywgc3RhdGlvbl9pZClcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbihkYXRhKXtcbiAgICAgICAgICAgIHJldHVybiBfLm1hcChkYXRhLCBmdW5jdGlvbihvYmope1xuICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhdGlvbihvYmopO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQXBpQ2xpZW50O1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrL2FwaV9jbGllbnQuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbi8qKlxuICogQSBzaW1wbGUgc2VydmljZSBjb250YWluZXIgdGhhdCBjb250YWlucyB0aGUgcmVnaXN0ZXJlZCB3aWRnZXRzIGFuZCBoYW5kbGVzIHN0YXJ0dXAgYW5kIHRlYXJkb3duLlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBDb250YWluZXIob3B0aW9ucyl7XG4gICAgdGhpcy5vcHRpb25zID0gXy5kZWZhdWx0cyhvcHRpb25zIHx8IHt9LCB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiAgQG9wdGlvbiBjb250ZXh0XG4gICAgICAgICAqICBDYW4gYmUgdXNlZCB0byBsaW1pdCB0aGUgc2NvcGUgdG8gc2VhcmNoIGZvciB3aWRnZXRzIGluLlxuICAgICAgICAgKiAgQWxzbyBjYW4gYmUgdXNlZCB0byBzdHViIGluIGEgZml4dHVyZS5cbiAgICAgICAgICovXG4gICAgICAgIGNvbnRleHQgOiAkKGRvY3VtZW50KSxcbiAgICAgICAgYmFzZVVybDogJ2h0dHA6Ly93d3cuYmxhc3QubnUnXG4gICAgfSk7XG59XG5cbkNvbnRhaW5lci5wcm90b3R5cGUgPSBfLmV4dGVuZChDb250YWluZXIucHJvdG90eXBlLCB7XG4gICAgLyoqXG4gICAgICogVGFrZXMgc2V2ZXJhbCBXaWRnZXRzIGFuZCBjb21iaW5lcyBpbnRvIGFuIG9iamVjdFxuICAgICAqXG4gICAgICogQHBhcmFtIHthcnJheX0gYXJyYXlcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSB0aGUgcmVnaXN0ZXJlZCB3aWRnZXRzXG4gICAgICovXG4gICAgcmVnaXN0ZXIgOiBmdW5jdGlvbihhcnJheSl7XG4gICAgICAgIHJldHVybiBfLm9iamVjdChfLm1hcChhcnJheSxcbiAgICAgICAgICAgIGZ1bmN0aW9uKHdpZGdldCl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LnByb3RvdHlwZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB3aWRnZXRcbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgICkpO1xuICAgIH0sXG4gICAgLyoqXG4gICAgICogTG9vcHMgdGhyb3VnaCB0aGUgd2lkZ2V0IG1hbmlmZXN0cyBhbmQgZmluZHMgbWF0Y2hpbmcgRE9NIGVsZW1lbnRzIGFuZCBjcmVhdGVzIGEgd2lkZ2V0IGluc3RhbmNlIGZvciBlYWNoLlxuICAgICAqIFRoZSBgLnN0YXJ0VXBgIG1ldGhvZCBpcyB0aGVuIGNhbGxlZCBmb3IgZWFjaCB3aWRnZXQgaW5zdGFuY2UuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHdpZGdldHNcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gY29udGV4dFxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgICovXG4gICAgc3RhcnRBbGwgOiBmdW5jdGlvbih3aWRnZXRzLCBjb250ZXh0KXtcbiAgICAgICAgY29udGV4dCA9IGNvbnRleHQgfHwgdGhpcy5vcHRpb25zLmNvbnRleHQ7XG4gICAgICAgIHJldHVybiBfLmVhY2god2lkZ2V0cywgZnVuY3Rpb24od2lkZ2V0KXtcbiAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGNvbnRleHQuZmluZCh3aWRnZXQucHJvdG90eXBlLnNlbGVjdG9yKTtcblxuICAgICAgICAgICAgLy8gTG9vcCB0aHJvdWdoIG1hdGNoaW5nIERPTSBlbGVtZW50c1xuICAgICAgICAgICAgd2lkZ2V0Lmluc3RhbmNlcyA9IF8ubWFwKGVsZW1lbnRzLCBmdW5jdGlvbihlbGVtKXtcbiAgICAgICAgICAgICAgICB2YXIgaW5zdGFuY2UgPSB3aWRnZXQucHJvdG90eXBlLmNyZWF0ZSgpO1xuICAgICAgICAgICAgICAgIGluc3RhbmNlLnN0YXJ0VXAoJChlbGVtKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGluc3RhbmNlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gd2lkZ2V0O1xuICAgICAgICB9KTtcbiAgICB9LFxuICAgIC8qKlxuICAgICAqIFJ1bnMgYWZ0ZXIgYC5zdGFydEFsbGAgYW5kIGNhbGxzIHRoZSB1cGRhdGUgbWV0aG9kIGlmIGF2YWlsYWJsZSBmb3IgZWFjaCB3aWRnZXRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gd2lkZ2V0c1xuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IHRoZSB1cGRhdGVkIHdpZGdldHNcbiAgICAgKi9cbiAgICB1cGRhdGVBbGwgOiBmdW5jdGlvbih3aWRnZXRzKSB7XG4gICAgICAgIHZhciBjb250YWluZXIgPSB0aGlzO1xuICAgICAgICByZXR1cm4gXy5lYWNoKHdpZGdldHMsIGZ1bmN0aW9uICh3aWRnZXQpIHtcbiAgICAgICAgICAgIHdpZGdldC5pbnN0YW5jZXMgPSBfLmVhY2god2lkZ2V0Lmluc3RhbmNlcywgZnVuY3Rpb24gKGluc3RhbmNlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnN0YW5jZS51cGRhdGUgPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGluc3RhbmNlLnVwZGF0ZS5jYWxsKGluc3RhbmNlLCBjb250YWluZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gaW5zdGFuY2U7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB3aWRnZXQ7XG4gICAgICAgIH0pO1xuICAgIH1cbn0pO1xuXG4vKipcbiAqIENyZWF0ZSBhIG5ldyBzZXJ2aWNlIGNvbnRhaW5lclxuICogQHNlZSBDb250YWluZXIgZm9yIHBhcmFtcy5cbiAqL1xuZXhwb3J0cy5jcmVhdGUgPSAoZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGFyZ3MpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDb250YWluZXIoYXJncyk7XG4gICAgfVxufSkoKTtcblxuZXhwb3J0cy5Db25zdHJ1Y3RvciA9IENvbnRhaW5lcjtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jb250YWluZXIuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBBcGlDbGllbnQgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvYXBpX2NsaWVudCcpO1xudmFyIENyZWF0b3IgPSByZXF1aXJlKCd3aW5kdGFsa2Vycy9mcmFtZXdvcmsvY3JlYXRvcicpO1xuXG4vKipcbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gQ29udHJvbGxlcigpe31cblxubW9kdWxlLmV4cG9ydHMgPSBDcmVhdG9yLnByb3RvdHlwZS5leHRlbmQoQ3JlYXRvciwgQ29udHJvbGxlciwge1xuICAgIGNsaWVudDogbmV3IEFwaUNsaWVudCgpXG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jb250cm9sbGVyLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29ya1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgRXh0ZW5kYWJsZSA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2ZyYW1ld29yay9leHRlbmRhYmxlJyk7XG5cbi8qKlxuICogVGhlIEFscGhhICYgT21lZ2Egb2Ygb2JqZWN0IGNyZWF0aW9uXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gQ3JlYXRvcigpe31cblxubW9kdWxlLmV4cG9ydHMgPSBFeHRlbmRhYmxlLnByb3RvdHlwZS5leHRlbmQoRXh0ZW5kYWJsZSwgQ3JlYXRvciwge1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgaW5zdGFuY2Ugb2YgdGhlIGNvbnRyb2xsZXIgd2l0aCBwcm9wcyBhcyBwcm9wZXJ0aWVzLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fEZ1bmN0aW9ufSBwcm9wc1xuICAgICAqICBmdW5jdGlvbnMgc2hvdWxkIGhhdmUgdGhlIGZvbGxpbmcgc2lnbmF0dXJlLlxuICAgICAqICAgICAgZnVuY3Rpb24oe09iamVjdH0gaW5zdGFuY2UpIC0+IHtPYmplY3R9XG4gICAgICogQHJldHVybnMge09iamVjdH0gYSBuZXcgbW9kZWwgaW5zdGFuY2VcbiAgICAgKi9cbiAgICBjcmVhdGUgOiBmdW5jdGlvbihwcm9wcyl7XG4gICAgICAgIHZhciBpbnN0YW5jZSA9IE9iamVjdC5jcmVhdGUodGhpcyk7XG4gICAgICAgIGlmIChfLmlzRnVuY3Rpb24ocHJvcHMpKSB7XG4gICAgICAgICAgICBwcm9wcyA9IHByb3BzLmNhbGwodGhpcywgaW5zdGFuY2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBfLmV4dGVuZChpbnN0YW5jZSwgcHJvcHMgfHwge30pO1xuICAgIH1cbn0pO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrL2NyZWF0b3IuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmZ1bmN0aW9uIEV4dGVuZGFibGUoKXt9XG5cbi8vIEV4dGVuZCB0aGUgZXh0ZW5kYWJsZS4gSG93IGZhciBvdXQgaXMgdGhpcz9cbkV4dGVuZGFibGUucHJvdG90eXBlID0gXy5leHRlbmQoRXh0ZW5kYWJsZS5wcm90b3R5cGUsIHtcbiAgICAvKipcbiAgICAgKiBFeHRlbmQgXCJzdWJjbGFzc2VzXCIgd2l0aCBjb250cm9sbGVyIG1ldGhvZHNcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBwYXJlbnRcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjaGlsZFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fEZ1bmN0aW9ufSBleHRyYXMgLSBhZGRpdGlvbmFsIHByb3BlcnRpZXMgdG8gYWRkIHRvIHByb3RvdHlwZS5cbiAgICAgKiBAcmV0dXJucyB7RnVuY3Rpb259XG4gICAgICovXG4gICAgZXh0ZW5kOiBmdW5jdGlvbihwYXJlbnQsIGNoaWxkLCBleHRyYXMpe1xuICAgICAgICBjaGlsZC5wcm90b3R5cGUgPSBfLmV4dGVuZChjaGlsZC5wcm90b3R5cGUsIHBhcmVudC5wcm90b3R5cGUpO1xuICAgICAgICBjaGlsZC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjaGlsZDtcbiAgICAgICAgaWYgKGV4dHJhcykge1xuICAgICAgICAgICAgaWYgKF8uaXNGdW5jdGlvbihleHRyYXMpKSB7XG4gICAgICAgICAgICAgICAgZXh0cmFzID0gZXh0cmFzLmNhbGwoY2hpbGQsIGNoaWxkLCBwYXJlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2hpbGQucHJvdG90eXBlID0gXy5leHRlbmQoY2hpbGQucHJvdG90eXBlLCBleHRyYXMgfHwge30pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjaGlsZDtcbiAgICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBFeHRlbmRhYmxlO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrL2V4dGVuZGFibGUuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBDcmVhdG9yID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL2NyZWF0b3InKTtcblxuLyoqXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIE1vZGVsKCl7fVxuXG5tb2R1bGUuZXhwb3J0cyA9IENyZWF0b3IucHJvdG90eXBlLmV4dGVuZChDcmVhdG9yLCBNb2RlbCk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiLy4uLy4uL25vZGVfbW9kdWxlcy93aW5kdGFsa2Vycy9mcmFtZXdvcmsvbW9kZWwuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBDcmVhdG9yID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL2NyZWF0b3InKTtcblxuLyoqXG4gKiBVc2VkIHRvIGNyZWF0ZSBwcm90b3R5cGUgZm9yIHZpZXdzLlxuICogQGNvbnN0cnVjdG9yIG5vdCBpbnRlbmRlZCBmb3IgZGlyZWN0IHVzZS5cbiAqL1xuZnVuY3Rpb24gVmlldygpe31cblxubW9kdWxlLmV4cG9ydHMgPSBDcmVhdG9yLnByb3RvdHlwZS5leHRlbmQoQ3JlYXRvciwgVmlldywge1xuICAgIC8qKlxuICAgICAqIEV4cGFuZHMgdGhlIC50ZW1wbGF0ZSB3aXRoIHZpZXdfZGF0YSBhc3NpZ25lZCBhcyB0aGUgdGVtcGxhdGVzIGNvbnRleHRcbiAgICAgKiAgVGhpcyBtZWFucyB0aGF0IGFueSB2aWV3IGRhdGEgY2FuIGJlIGFjY2Vzc2VkIHdpdGggYHRoaXNgIGZyb20gdGhlIHRlbXBsYXRlXG4gICAgICogQHBhcmFtIHZpZXdfZGF0YVxuICAgICAqIEBwYXJhbSB0cmFuc2xhdGlvbnNcbiAgICAgKiBAcmV0dXJucyB7alF1ZXJ5fVxuICAgICAqL1xuICAgIHJlbmRlciA6IGZ1bmN0aW9uKHZpZXdfZGF0YSwgdHJhbnNsYXRpb25zKXtcbiAgICAgICAgdmFyIHJlbmRlcmVkO1xuXG4gICAgICAgIHZpZXdfZGF0YSA9IHZpZXdfZGF0YSB8fCB7fTtcbiAgICAgICAgdHJhbnNsYXRpb25zID0gIF8uZGVmYXVsdHModHJhbnNsYXRpb25zIHx8IHt9LCB0aGlzLmRlZmF1bHRUcmFuc2xhdGlvbnMgfHwge30pO1xuICAgICAgICByZW5kZXJlZCA9ICQodGhpcy50ZW1wbGF0ZS5jYWxsKFxuICAgICAgICAgICAgXy5leHRlbmQoXG4gICAgICAgICAgICAgICAgdmlld19kYXRhLCB7XG4gICAgICAgICAgICAgICAgICAgIHRyYW5zOiBfLmRlZmF1bHRzKHRyYW5zbGF0aW9ucyB8fCB7fSwgdGhpcy5kZWZhdWx0VHJhbnNsYXRpb25zIHx8IHt9KVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICksXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgLy8gc2hvcnRjdXQgdG8gdHJhbnNsYXRpb25zXG4gICAgICAgICAgICAgICAgdCA6IHRyYW5zbGF0aW9uc1xuICAgICAgICAgICAgfVxuICAgICAgICApKTtcblxuICAgICAgICBpZiAoXy5pc0Z1bmN0aW9uKHRoaXNbJ2FmdGVyUmVuZGVyJ10pKSB7XG4gICAgICAgICAgICB0aGlzLmFmdGVyUmVuZGVyKHJlbmRlcmVkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZW5kZXJlZDtcbiAgICB9XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay92aWV3LmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29ya1wiKSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwsQnVmZmVyLF9fYXJndW1lbnQwLF9fYXJndW1lbnQxLF9fYXJndW1lbnQyLF9fYXJndW1lbnQzLF9fZmlsZW5hbWUsX19kaXJuYW1lKXtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgQ3JlYXRvciA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jcmVhdG9yJyk7XG5cbi8qKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIFdpZGdldCgpe31cblxubW9kdWxlLmV4cG9ydHMgPSBDcmVhdG9yLnByb3RvdHlwZS5leHRlbmQoQ3JlYXRvciwgV2lkZ2V0LCB7XG4gICAgbmFtZTogbnVsbCxcbiAgICBzZWxlY3RvciA6IG51bGwsXG4gICAgc3RhcnRVcDogZnVuY3Rpb24oKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwidGhpcy5uYW1lIFwiK1wid2lkZ2V0IGRvZXMgbm90IGltcGxlbWVudCB0aGUgLnN0YXJ0VXAgbWV0aG9kXCIpO1xuICAgIH0sXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIHdyYXBwaW5nIGVsZW1lbnQgZm9yIGNyZWF0aW5nIHdpZGdldHMgb24gdGhlIGZseS5cbiAgICAgKiBAcmV0dXJucyB7alF1ZXJ5fVxuICAgICAqL1xuICAgIGNyZWF0ZUVsZW1lbnQgOiBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4gJCgnPGRpdiBjbGFzcz1cIndpbmR0YWxrZXJzLXdpZGdldFwiPicpXG4gICAgICAgICAgICAuYWRkQ2xhc3ModGhpcy5zZWxlY3Rvci5yZXBsYWNlKCcuJywgJycpKTtcbiAgICB9XG59KTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL2ZyYW1ld29yay93aWRnZXQuanNcIixcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvZnJhbWV3b3JrXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG4vKipcbiAqIENyZWF0ZXMgYW4gaWNvbiBmb3Igc3RhdGlvbiBkZXBlbmRpbmcgb24gc3RhdGlvbiBzdGF0ZS5cbiAqIENhbiBiZSBlaXRoZXIgYSBjcm9zcyBmb3IgYW4gb2ZmbGluZSBzdGF0aW9uIG9yIGFuIGFycm93IGRpc3BsYXlpbmcgd2luZCBkaXJlY3Rpb24uXG4gKiBAcGFyYW0ge1N0YXRpb259IHN0YXRpb25cbiAqIEByZXR1cm5zIHtNYXBWaWV3Lkljb259XG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gSWNvbihzdGF0aW9uKXtcbiAgICB2YXIgY29sb3IsIG9ic2VydmF0aW9uID0gc3RhdGlvbi5sYXRlc3RPYnNlcnZhdGlvbjtcbiAgICB2YXIgZ21hcHMgPSBnbG9iYWwuZ29vZ2xlLm1hcHM7XG4gICAgdmFyIGJlYXVmb3J0ID0ge1xuICAgICAgICAxOiB7XG4gICAgICAgICAgICBtaW46IDAsXG4gICAgICAgICAgICBtYXg6IDAuMyxcbiAgICAgICAgICAgIGNvbG9yOiBcIiNGRkZcIlxuICAgICAgICB9LFxuICAgICAgICAyOiB7XG4gICAgICAgICAgICBtaW46IDAuMyxcbiAgICAgICAgICAgIG1heDozLjUsXG4gICAgICAgICAgICBjb2xvcjogXCIjQTRGNUNDXCJcbiAgICAgICAgfSxcbiAgICAgICAgMzoge1xuICAgICAgICAgICAgbWluOiAzLjUsXG4gICAgICAgICAgICBtYXg6IDUuNSxcbiAgICAgICAgICAgIGNvbG9yOiBcIiM5OUZGOTlcIlxuICAgICAgICB9LFxuICAgICAgICA0OiB7XG4gICAgICAgICAgICBtaW46IDUuNSxcbiAgICAgICAgICAgIG1heDogNy45LFxuICAgICAgICAgICAgY29sb3I6IFwiIzk5RkY2NlwiXG4gICAgICAgIH0sXG4gICAgICAgIDU6IHtcbiAgICAgICAgICAgIG1pbjogOC4wLFxuICAgICAgICAgICAgbWF4OiAxMC44LFxuICAgICAgICAgICAgY29sb3I6IFwiIzk5RkYwMFwiXG4gICAgICAgIH0sXG4gICAgICAgIDY6IHtcbiAgICAgICAgICAgIG1pbjogMTAuOCxcbiAgICAgICAgICAgIG1heDogMTMuOCxcbiAgICAgICAgICAgIGNvbG9yOiBcIiNDQ0ZGMDBcIlxuICAgICAgICB9LFxuICAgICAgICA3OiB7XG4gICAgICAgICAgICBtaW46IDEzLjksXG4gICAgICAgICAgICBtYXg6IDE3LjIsXG4gICAgICAgICAgICBjb2xvcjogXCIjRkZGRjAwXCJcbiAgICAgICAgfSxcbiAgICAgICAgODoge1xuICAgICAgICAgICAgbWluOiAxNy4yLFxuICAgICAgICAgICAgbWF4OiAyMC44LFxuICAgICAgICAgICAgY29sb3I6IFwiI0ZGQ0MwMFwiXG4gICAgICAgIH0sXG4gICAgICAgIDk6IHtcbiAgICAgICAgICAgIG1pbjogMjAuOCxcbiAgICAgICAgICAgIG1heDogMjQuNSxcbiAgICAgICAgICAgIGNvbG9yOiBcIiNGRjk5MDBcIlxuICAgICAgICB9LFxuICAgICAgICAxMDoge1xuICAgICAgICAgICAgbWluOiAyNC41LFxuICAgICAgICAgICAgbWF4OiAyOC41LFxuICAgICAgICAgICAgY29sb3I6IFwiI0ZGNjYwMFwiXG4gICAgICAgIH0sXG4gICAgICAgIDExOiB7XG4gICAgICAgICAgICBtaW46IDI4LjUsXG4gICAgICAgICAgICBtYXg6IDMyLjcsXG4gICAgICAgICAgICBjb2xvcjogXCIjRkYzMzAwXCJcbiAgICAgICAgfSxcbiAgICAgICAgMTI6IHtcbiAgICAgICAgICAgIG1pbjogMzIuNyxcbiAgICAgICAgICAgIG1heDogOTk5LFxuICAgICAgICAgICAgY29sb3I6IFwiI0ZGMDAwMFwiXG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8vIERlZmF1bHRzXG4gICAgXy5leHRlbmQodGhpcywge1xuICAgICAgICBmaWxsT3BhY2l0eTogMC44LFxuICAgICAgICBzdHJva2VDb2xvcjogJ2JsYWNrJyxcbiAgICAgICAgc3Ryb2tlV2VpZ2h0OiAxLjJcbiAgICB9KTtcbiAgICBpZiAoIXN0YXRpb24ub2ZmbGluZSAmJiBvYnNlcnZhdGlvbikge1xuICAgICAgICBjb2xvciA9IChfLmZpbmQoYmVhdWZvcnQsIGZ1bmN0aW9uKGJmKXtcbiAgICAgICAgICAgIHJldHVybiAob2JzZXJ2YXRpb24uc3BlZWQgPj0gYmYubWluICYmIG9ic2VydmF0aW9uLnNwZWVkIDwgYmYubWF4KTtcbiAgICAgICAgfSkpLmNvbG9yO1xuICAgICAgICBfLmV4dGVuZCh0aGlzLCB7XG4gICAgICAgICAgICBwYXRoOiBcIk0yMCwzLjI3MmMwLDAsMTMuNzMxLDEyLjUzLDEzLjczMSwxOS4xNzFTMzEuMTMsMzYuNzI4LDMxLjEzLDM2LjcyOFMyMy4zNzIsMzEuNTM2LDIwLDMxLjUzNiBTOC44NywzNi43MjgsOC44NywzNi43MjhzLTIuNjAxLTcuNjQ0LTIuNjAxLTE0LjI4NVMyMCwzLjI3MiwyMCwzLjI3MnpcIixcbiAgICAgICAgICAgIG5hbWU6ICdBcnJvd0ljb24nLFxuICAgICAgICAgICAgc2l6ZTogbmV3IGdtYXBzLlNpemUoNDAsIDQwKSxcbiAgICAgICAgICAgIG9yaWdpbjogbmV3IGdtYXBzLlBvaW50KDIwLDIwKSxcbiAgICAgICAgICAgIGFuY2hvcjogbmV3IGdtYXBzLlBvaW50KDIwLCAyMCksXG4gICAgICAgICAgICBmaWxsQ29sb3I6IGNvbG9yID8gY29sb3IgOiAncmVkJyxcbiAgICAgICAgICAgIHJvdGF0aW9uOiAxODAuMCArIG9ic2VydmF0aW9uLmRpcmVjdGlvblxuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBfLmV4dGVuZCh0aGlzLCB7XG4gICAgICAgICAgICBwYXRoIDogXCJNNDIuMTQzLDM0LjA1NUwzMC42MTEsMjIuNTIzbDExLjUzMS0xMS41MzFjLTEuODI4LTIuOTgzLTQuMzQ0LTUuNDk5LTcuMzI3LTcuMzI3TDIzLjI4NCwxNS4xOTdMMTEuNzUzLDMuNjY1IEM4Ljc3LDUuNDkzLDYuMjU0LDguMDA5LDQuNDI2LDEwLjk5MmwxMS41MzEsMTEuNTMxTDQuNDI2LDM0LjA1NWMxLjgyOCwyLjk4Myw0LjM0NCw1LjQ5OSw3LjMyNyw3LjMyN0wyMy4yODQsMjkuODVsMTEuNTMxLDExLjUzMSBDMzcuNzk5LDM5LjU1NCw0MC4zMTUsMzcuMDM4LDQyLjE0MywzNC4wNTV6XCIsXG4gICAgICAgICAgICBuYW1lOiAnT2ZmbGluZUljb24nLFxuICAgICAgICAgICAgc2l6ZTogbmV3IGdtYXBzLlNpemUoMjUsIDI1KSxcbiAgICAgICAgICAgIG9yaWdpbjogbmV3IGdtYXBzLlBvaW50KDIwLCAyMCksXG4gICAgICAgICAgICBhbmNob3I6IG5ldyBnbWFwcy5Qb2ludCgyMywgMjMpLFxuICAgICAgICAgICAgZmlsbENvbG9yOiAnd2hpdGUnXG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBJY29uO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJvTWZwQW5cIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9LHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyLGFyZ3VtZW50c1szXSxhcmd1bWVudHNbNF0sYXJndW1lbnRzWzVdLGFyZ3VtZW50c1s2XSxcIi8uLi8uLi9ub2RlX21vZHVsZXMvd2luZHRhbGtlcnMvbWFwcy9pY29uLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL21hcHNcIikiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsLEJ1ZmZlcixfX2FyZ3VtZW50MCxfX2FyZ3VtZW50MSxfX2FyZ3VtZW50MixfX2FyZ3VtZW50MyxfX2ZpbGVuYW1lLF9fZGlybmFtZSl7XG5cInVzZSBzdHJpY3RcIjtcblxuLyoqXG4gKiBPYmplY3QuY3JlYXRlIHBvbHlmaWxsXG4gKiBAc2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9jcmVhdGUjUG9seWZpbGxcbiAqL1xuaWYgKHR5cGVvZiBPYmplY3QuY3JlYXRlICE9ICdmdW5jdGlvbicpIHtcbiAgICAoZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgRiA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICBPYmplY3QuY3JlYXRlID0gZnVuY3Rpb24gKG8pIHtcbiAgICAgICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgIHRocm93IEVycm9yKCdTZWNvbmQgYXJndW1lbnQgbm90IHN1cHBvcnRlZCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBvICE9ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgVHlwZUVycm9yKCdBcmd1bWVudCBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgRi5wcm90b3R5cGUgPSBvO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGKCk7XG4gICAgICAgIH07XG4gICAgfSkoKTtcbn1cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwib01mcEFuXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcixhcmd1bWVudHNbM10sYXJndW1lbnRzWzRdLGFyZ3VtZW50c1s1XSxhcmd1bWVudHNbNl0sXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzL3BvbHlmaWxsLmpzXCIsXCIvLi4vLi4vbm9kZV9tb2R1bGVzL3dpbmR0YWxrZXJzXCIpIiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCxCdWZmZXIsX19hcmd1bWVudDAsX19hcmd1bWVudDEsX19hcmd1bWVudDIsX19hcmd1bWVudDMsX19maWxlbmFtZSxfX2Rpcm5hbWUpe1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnJlcXVpcmUoJ3dpbmR0YWxrZXJzL3BvbHlmaWxsJyk7XG52YXIgQ3JlYXRvciA9IHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2ZyYW1ld29yay9jcmVhdG9yJyk7XG52YXIgQ29udGFpbmVyID0gcmVxdWlyZSgnd2luZHRhbGtlcnMvZnJhbWV3b3JrL2NvbnRhaW5lcicpO1xudmFyIHdpbmR0YWxrZXJzO1xuXG5mdW5jdGlvbiBXaW5kdGFsa2VycyhvcHRpb25zKXtcbiAgICByZXR1cm4gV2luZHRhbGtlcnMucHJvdG90eXBlLmNyZWF0ZSh7XG4gICAgICAgIGNvbnRhaW5lcjogQ29udGFpbmVyLmNyZWF0ZShvcHRpb25zKVxuICAgIH0pXG59XG5cbkNyZWF0b3IucHJvdG90eXBlLmV4dGVuZChDcmVhdG9yLCBXaW5kdGFsa2Vycywge1xuICAgIGluaXQgOiBmdW5jdGlvbigpe1xuICAgICAgICB2YXIgd2lkZ2V0cyA9IHt9O1xuICAgICAgICB3aWRnZXRzLnJlZ2lzdGVyZWQgPSB0aGlzLmNvbnRhaW5lci5yZWdpc3RlcihbXG4gICAgICAgICAgICByZXF1aXJlKCd3aW5kdGFsa2Vycy9hcHAvd2lkZ2V0cy9tb2RhbF93aWRnZXQnKSxcbiAgICAgICAgICAgIHJlcXVpcmUoJ3dpbmR0YWxrZXJzL2FwcC93aWRnZXRzL3RhYmxlX3dpZGdldCcpLFxuICAgICAgICAgICAgcmVxdWlyZSgnd2luZHRhbGtlcnMvYXBwL3dpZGdldHMvbWFwX3dpZGdldCcpXG4gICAgICAgIF0pO1xuICAgICAgICB3aWRnZXRzLnN0YXJ0ZWQgPSB0aGlzLmNvbnRhaW5lci5zdGFydEFsbCh3aWRnZXRzLnJlZ2lzdGVyZWQpO1xuICAgICAgICByZXR1cm4gd2lkZ2V0cztcbiAgICB9XG59KTtcblxualF1ZXJ5KGRvY3VtZW50KS5yZWFkeShmdW5jdGlvbigpe1xuICAgIFdpbmR0YWxrZXJzKCkuaW5pdCgpO1xufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gV2luZHRhbGtlcnM7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcIm9NZnBBblwiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30scmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIsYXJndW1lbnRzWzNdLGFyZ3VtZW50c1s0XSxhcmd1bWVudHNbNV0sYXJndW1lbnRzWzZdLFwiL2Zha2VfZDYxNjJlNjMuanNcIixcIi9cIikiXX0=
