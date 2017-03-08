'use strict'

var eos = require('end-of-stream')
var util = require('util')
var fs = require('fs')
var stream = require('stream')

var SIGNAL_FLUSH = new Buffer([0])

var isFn = (fn) => typeof fn === 'function'

var isStream = (stream) => stream && typeof stream === 'object' && isFn(stream.pipe)

var isFS = (stream) => fs && (stream instanceof fs.ReadStream || stream instanceof fs.WriteStream) && isFn(stream.close)

var isRequest = (stream) => stream.setHeader && isFn(stream.abort)

var onuncork = (self, fn) => {
  if (self._corked) self.once('uncork', fn)
  else fn()
}

var ondrain = (self, err) => {
  var _ondrain = self._ondrain
  self._ondrain = null
  if (_ondrain) _ondrain(err)
}

var destroy = (stream) => { // from pump destoryer
  if (isFS(stream)) return stream.close()
  if (isRequest(stream)) return stream.abort()
  if (isFn(stream.destroy)) return stream.destroy()
}

var end = (ws, cb) => {
  if (!ws) return cb()
  if (ws._writableState && ws._writableState.finished) return cb()
  if (ws._writableState) return ws.end(cb)
  ws.end()
  cb()
}

function Writify (init, flush, opts) {
  if (!(this instanceof Writify)) return new Writify(init, flush, opts)
  stream.Writable.call(this, opts)
  this.destroyed = false

  var ready = (err, ws) => {
    this._ws = ws
    if (err) return this.destroy(err)
    if (this.destroyed) return destroy(this._ws)
    if (!this._ws) return
    this._ws.on('drain', () => ondrain(this))
    eos(this._ws, (err) => this.destroy(err))
    this.uncork()
  }

  this._flush = flush || ((cb) => cb())
  this._corked = 1 // corked on init
  this._ondrain = null
  this._drained = false
  if (isFn(init)) {
    var ws = init(ready)
    if (isStream(ws)) ready(null, ws)
  } else if (isStream(init)) {
    ready(null, init)
  } else {
    throw new Error('init must be a stream or function')
  }
}

util.inherits(Writify, stream.Writable)

Writify.obj = function (init, flush, opts) {
  if (!opts) opts = {}
  opts.objectMode = true
  opts.highWaterMark = 16
  return new Writify(init, flush, opts)
}

Writify.prototype.destroy = function (err) {
  if (this.destroyed) return
  this.destroyed = true
  if (err) {
    ondrain(this, err)
    this.emit('error', err)
  }
  if (this._ws) destroy(this._ws)
  this.emit('close')
}

Writify.prototype.cork = function () {
  if (++this._corked === 1) this.emit('cork')
}

Writify.prototype.uncork = function () {
  if (this._corked && --this._corked === 0) this.emit('uncork')
}

Writify.prototype._write = function (data, enc, cb) {
  if (this._corked) return onuncork(this, () => this._write(data, enc, cb))
  if (!this._ws) return cb(new Error('Write stream not exists'))
  if (data === SIGNAL_FLUSH) return this._finish(cb)

  if (this._ws.write(data) === false) this._ondrain = cb
  else cb()
}

Writify.prototype._finish = function (cb) {
  this.emit('preend')
  onuncork(this, () => {
    end(this._ws, () => {
      // do not emit prefinish twice
      if (this._writableState.prefinished === false) this._writableState.prefinished = true
      this.emit('prefinish')
      onuncork(this, () => {
        this.emit('flush')
        this._flush(cb)
      })
    })
  })
}

Writify.prototype.end = function (data, enc, cb) {
  if (typeof data === 'function') return this.end(null, null, data)
  if (typeof enc === 'function') return this.end(data, null, enc)
  this._ended = true
  if (data) this.write(data)
  this.write(SIGNAL_FLUSH)
  stream.Writable.prototype.end.call(this, cb)
}

module.exports = Writify
