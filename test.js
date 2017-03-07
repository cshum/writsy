'use strict'

var writify = require('./')
var test = require('tape')
var from = require('from2')
var concat = require('concat-stream')
var pump = require('pump')

test('wrap writestream and flush success', (t) => {
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
