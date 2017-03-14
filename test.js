'use strict'

var writsy = require('./')
var test = require('tape')
var from = require('from2')
var concat = require('concat-stream')
var pump = require('pump')

test('writsy wrap function, callback and stream', (t) => {
  t.plan(8)

  pump(from(['a', 'b', 'c']), writsy(() => concat((buf) => {
    t.equal(buf.toString(), 'abc', 'wrap function')
  })), t.error)

  pump(from.obj(['a', 'b', 'c']), writsy.obj(() => concat((str) => {
    t.deepEqual(str, 'abc', 'obj wrap function')
  })), t.error)

  pump(from(['a', 'b', 'c']), writsy((cb) => {
    process.nextTick(() => cb(null, concat((buf) => {
      t.equal(buf.toString(), 'abc', 'wrao callback')
    })))
  }), t.error)

  pump(from(['a', 'b', 'c']), writsy(concat((buf) => {
    t.equal(buf.toString(), 'abc', 'wrao stream')
  })), t.error)
})

test('writsy flush success', (t) => {
  t.plan(4)
  var flushed = false
  var writer = writsy.obj((cb) => {
    process.nextTick(() => {
      cb(null, concat({encoding: 'objects'}, (arr) => {
        t.notOk(flushed, 'not flushed on inner stream end')
        t.deepEqual(arr, [1, 2, 3])
      }))
    })
  }, (cb) => {
    process.nextTick(() => {
      flushed = true
      cb()
    })
  })
  pump(from.obj([1, 2, 3]), writer, (err) => {
    t.error(err)
    t.ok(flushed, 'flushed')
  })
})

test('writsy class extend init flush success', (t) => {
  t.plan(4)
  class Writer extends writsy {
    constructor () {
      super({ objectMode: true, highWaterMark: 16 })
      this._flushed = false
    }
    _init (cb) {
      process.nextTick(() => {
        cb(null, concat({encoding: 'objects'}, (arr) => {
          t.notOk(this._flushed, 'not flushed on inner stream end')
          t.deepEqual(arr, [1, 2, 3])
        }))
      })
    }
    _flush (cb) {
      process.nextTick(() => {
        this._flushed = true
        cb()
      })
    }
  }
  var writer = new Writer()
  pump(from.obj([1, 2, 3]), writer, (err) => {
    t.error(err)
    t.ok(writer._flushed, 'flushed')
  })
})

test('writsy flush error', (t) => {
  t.plan(3)
  var inner
  var writer = writsy.obj((cb) => {
    process.nextTick(() => {
      inner = concat({encoding: 'objects'}, (arr) => {
        t.deepEqual(arr, [1, 2, 3])
      })
      cb(null, inner)
    })
  }, (cb) => {
    process.nextTick(() => {
      cb(new Error('flush error'))
    })
  })
  pump(from.obj([1, 2, 3]), writer, (err) => {
    t.equal(err.message, 'flush error')
    t.ok(writer.destroyed, 'writer destroyed')
  })
})

test('wrifity init error', (t) => {
  t.plan(5)
  var writer = writsy.obj((cb) => {
    process.nextTick(() => cb(new Error('init error')))
  })
  pump(from.obj([1, 2, 3]), writer, (err) => {
    t.equal(err.message, 'init error')
    t.ok(writer.destroyed, 'stream destroyed')
  })

  t.throws(() => writsy(true), 'init must be a stream or function')
  t.throws(() => writsy((cb) => cb(), 'stream not exists'))
  t.throws(() => writsy((cb) => {
    cb(null, from(['a', 'b', 'c']))
    cb(null, from(['d', 'e', 'f']))
  }), 'multiple init callback')
})

test('cork write', (t) => {
  t.plan(2)
  var ws = writsy((cb) => cb(null, concat()))
  var ok = false
  pump(from(['a', 'b', 'c']), ws, (err) => {
    t.error(err)
    t.ok(ok)
  })
  ws.cork()
  setTimeout(() => {
    ok = true
    ws.uncork()
  }, 100)
})

test('cork preend prefinish flush', (t) => {
  t.plan(4)
  var preend = false
  var prefinish = false
  var flushed = false
  var ws = writsy((cb) => cb(null, concat()), (cb) => cb())
  pump(from(['a', 'b', 'c']), ws, (err) => {
    t.ok(flushed, 'flushed')
    t.error(err)
  })
  ws.on('preend', () => {
    ws.cork()
    setTimeout(() => {
      preend = true
      ws.uncork()
    }, 100)
  })
  ws.on('prefinish', () => {
    ws.cork()
    setTimeout(() => {
      t.ok(preend, 'preend')
      prefinish = true
      ws.uncork()
    }, 100)
  })
  ws.on('flush', () => {
    t.ok(prefinish, 'prefinish')
    flushed = true
  })
})
