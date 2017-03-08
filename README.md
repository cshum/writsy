# writify

Write stream wrapper that supports async initialization and flush function.

[![Build Status](https://travis-ci.org/cshum/writify.svg?branch=master)](https://travis-ci.org/cshum/writify)

```
npm install writify
```

#### `var ws = writify(init, [flush], [opts])`
#### `var ws = writify.obj(init, [flush], [opts])`

Wraps a new writable stream (or object stream) by passing `init` callback function.
Supports optional `flush` function that is called before 'finish' emitted.

```js
var writify = require('writify')
...

var ws = writify((cb) => {
  // async initialization, error handling
  mkdirp('/tmp/foo/', (err) => {
    if (err) return cb(err)
    cb(null, fs.createWriteStream('/tmp/foo/bar.txt'))
  })
}, (cb) => {
  // flush before finish
  fs.rename('/tmp/foo/bar.txt', './dest.txt', cb)
})

fs.createReadStream('loremipsum.txt').pipe(ws)

```

## License

MIT

