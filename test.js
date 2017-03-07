'use strict'

var writify = require('./')
var test = require('tape')
var from = require('from2')
var concat = require('concat-stream')
var pump = require('pump')

test('writify wrap stream', (t) => {
  t.plan(3)
  var writer = writify((cb) => cb(null, concat((buf) => {
    t.ok(buf instanceof Buffer)
    t.equal(buf.toString(), 'abc')
  })))
  pump(from(['a', 'b', 'c']), writer, (err) => {
    t.error(err)
  })
})

test('writify wrap object stream', (t) => {
  t.plan(2)
  var writer = writify.obj((cb) => cb(null, concat({encoding: 'objects'}, (arr) => {
    t.deepEqual(arr, [1, 2, 3])
  })))
  pump(from.obj([1, 2, 3]), writer, (err) => {
    t.error(err)
  })
})

test('writify flush success', (t) => {
  t.plan(4)
  var flushed = false
  var writer = writify.obj((cb) => {
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

test('writify flush error', (t) => {
  t.plan(3)
  var inner
  var writer = writify.obj((cb) => {
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
  t.plan(2)
  var writer = writify.obj((cb) => {
    process.nextTick(() => cb(new Error('init error')))
  }, (cb) => {
    t.fail('should not flush on init error')
  })
  pump(from.obj([1, 2, 3]), writer, (err) => {
    t.equal(err.message, 'init error')
    t.ok(writer.destroyed, 'stream destroyed')
  })
})

test('cork', (t) => {
  t.plan(1)
  var ws = writify((cb) => cb(null, concat()))
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
