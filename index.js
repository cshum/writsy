'use strict'

var eos = require('end-of-stream')
var util = require('util')
var fs = require('fs')
var stream = require('stream')

var SIGNAL_FLUSH = new Buffer([0])

var noop = () => true

var onuncork = (self, fn) => {
  if (self._corked) self.once('uncork', fn)
  else fn()
}

var ondrain = (self, err) => {
  var _ondrain = self._ondrain
  self._ondrain = null
  if (_ondrain) _ondrain(err)
}

var isFn = (fn) => {
  return typeof fn === 'function'
}

var isFS = (stream) => {
  return (stream instanceof (fs.ReadStream || noop) || stream instanceof (fs.WriteStream || noop)) && isFn(stream.close)
}

var isRequest = (stream) => {
  return stream.setHeader && isFn(stream.abort)
}

var destroy = (stream) => {
  if (isFS(stream)) return stream.close() // use close for fs streams to avoid fd leaks
  if (isRequest(stream)) return stream.abort() // request.destroy just do .end - .abort is what we want
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
  this.destroyed = false

  this._ws = null
  this._init = init
  this._flush = flush || ((cb) => cb())
  this._corked = 0
  this._ondrain = null
  this._drained = false

  stream.Writable.call(this, opts)
}

util.inherits(Writify, stream.Writable)

Writify.obj = (init, flush, opts) => {
  if (!opts) opts = {}
  opts.objectMode = true
  opts.highWaterMark = 16
  return new Writify(init, flush, opts)
}

Writify.prototype._setup = (data, enc, cb) => {
  this._init((err, ws) => {
    if (err) return cb(err)
    if (this.destroyed) return destroy(ws)
    this._ws = ws
    ws.on('drain', () => ondrain(this))
    eos(ws, (err) => this.destroy(err))
    this._write(data, enc, cb)
  })
}

Writify.prototype.destroy = (err) => {
  if (this.destroyed) return
  this.destroyed = true
  if (err) {
    ondrain(this, err)
    this.emit('error', err)
  }
  if (this._ws) destroy(this._ws)
  this.emit('close')
}

Writify.prototype.cork = () => {
  if (++this._corked === 1) this.emit('cork')
}

Writify.prototype.uncork = () => {
  if (this._corked && --this._corked === 0) this.emit('uncork')
}

Writify.prototype._write = (data, enc, cb) => {
  if (!this._ws) return this._setup(data, enc, cb)
  if (this._corked) return onuncork(this, () => this._write(data, end, cb))
  if (data === SIGNAL_FLUSH) return this._finish(cb)
  this._ws.write(data, enc, cb)
}

Writify.prototype._finish = (cb) => {
  this.emit('preend')
  onuncork(this, () => {
    end(this._ws, () => {
      onuncork(this, () => {
        this.emit('prefinish')
        this._flush(cb)
      })
    })
  })
}

Writify.prototype.end = (data, enc, cb) => {
  if (typeof data === 'function') return this.end(null, null, data)
  if (typeof enc === 'function') return this.end(data, null, enc)
  this._ended = true
  if (data) this.write(data)
  this.write(SIGNAL_FLUSH)
  stream.Writable.prototype.end.call(this, cb)
}

module.exports = Writify
