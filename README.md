# writsy

Write stream wrapper that supports async initialization and flush function.

[![Build Status](https://travis-ci.org/cshum/writsy.svg?branch=master)](https://travis-ci.org/cshum/writsy)

```
npm install writsy
```

#### `var ws = writsy([opts])`
#### `var ws = writsy.obj([opts])`

Wraps a new writable stream (or object stream) by passing `init` callback function.
Supports optional `flush` function that is called before 'finish' emitted.

```js
var writsy = require('writsy')
...

var ws = writsy({
  init (cb) {
    // async initialization, error handling
    mkdirp('/tmp/foo/', (err) => {
      if (err) return cb(err)
      cb(null, fs.createWriteStream('/tmp/foo/bar.txt'))
    })
  },
  flush (cb) {
    // flush before finish
    fs.rename('/tmp/foo/bar.txt', './dest.txt', cb)
  }
})

fs.createReadStream('loremipsum.txt').pipe(ws)
```

Or class inheritance by setting `_init` and `_flush` methods:

```js
var Writsy = require('writsy')

class Writer extends Writsy {
  constructor (opts) {
    super(opts)
  }
  _init (cb) {
    // async initialization, error handling
    mkdirp('/tmp/foo/', (err) => {
      if (err) return cb(err)
      cb(null, fs.createWriteStream('/tmp/foo/bar.txt'))
    })
  }
  _flush (cb) {
    // flush before finish
    fs.rename('/tmp/foo/bar.txt', './dest.txt', cb)
  }
}

fs.createReadStream('loremipsum.txt').pipe(new Writer())
```

## License

MIT

