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

function Writsy (init, flush, opts) {
  if (!(this instanceof Writsy)) return new Writsy(init, flush, opts)
  this.destroyed = false

  this._corked = 1 // corked on init
  this._ondrain = null
  this._flush = null
  if (isFn(flush)) this._flush = flush
  else if (flush && !opts) opts = flush

  stream.Writable.call(this, opts)

  var ready = (err, ws) => {
    if (this._ws) throw new Error('multiple init callback')
    if (!err && !ws) throw new Error('Stream not exists')
    this._ws = ws
    if (err) return this.destroy(err)
    if (this.destroyed) return destroy(this._ws)
    if (!this._ws) return
    this._ws.on('drain', () => ondrain(this))
    eos(this._ws, (err) => this.destroy(err))
    this.uncork()
  }

  if (isFn(init)) {
    var ws = init(ready)
    if (isStream(ws)) ready(null, ws)
  } else if (isStream(init)) {
    ready(null, init)
  } else {
    throw new Error('init must be a stream or function')
  }
}

util.inherits(Writsy, stream.Writable)

Writsy.obj = function (init, flush, opts) {
  if (!opts) opts = {}
  opts.objectMode = true
  opts.highWaterMark = 16
  return new Writsy(init, flush, opts)
}

Writsy.prototype.destroy = function (err) {
  if (this.destroyed) return
  this.destroyed = true
  process.nextTick(() => {
    if (err) {
      ondrain(this, err)
      this.emit('error', err)
    }
    if (this._ws) destroy(this._ws)
    this.emit('close')
  })
}

Writsy.prototype.cork = function () {
  if (++this._corked === 1) this.emit('cork')
}

Writsy.prototype.uncork = function () {
  if (this._corked && --this._corked === 0) this.emit('uncork')
}

Writsy.prototype._write = function (data, enc, cb) {
  if (this._corked) return onuncork(this, () => this._write(data, enc, cb))
  if (!this._ws) return
  if (data === SIGNAL_FLUSH) return this._finish(cb)

  if (this._ws.write(data) === false) this._ondrain = cb
  else cb()
}

Writsy.prototype._finish = function (cb) {
  this.emit('preend')
  onuncork(this, () => {
    end(this._ws, () => {
      // do not emit prefinish twice
      if (this._writableState.prefinished === false) this._writableState.prefinished = true
      this.emit('prefinish')
      onuncork(this, () => {
        if (!this._flush) return cb()
        this.emit('flush')
        this._flush(cb)
      })
    })
  })
}

Writsy.prototype.end = function (data, enc, cb) {
  if (isFn(data)) return this.end(null, null, data)
  if (isFn(enc)) return this.end(data, null, enc)
  this._ended = true
  if (data) this.write(data)
  this.write(SIGNAL_FLUSH)
  return stream.Writable.prototype.end.call(this, cb)
}

module.exports = Writsy
