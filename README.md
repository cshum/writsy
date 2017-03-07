# writify

Write stream constructor that supports async initialization and flush function.

[![Build Status](https://travis-ci.org/cshum/writify.svg?branch=master)](https://travis-ci.org/cshum/writify)

```
npm install writify
```

### `var ws = writify(writer, [flush])`

```js
var writify = require('writify')
...

var writeStream = writify((cb) => {
  // async initialization, error handling
  mkdirp('/tmp/f/o/o', (err) => {
    if (err) return cb(err)
    cb(null, fs.createWriteStream('/tmp/f/o/o/bar.txt'))
  })
}, (cb) => {
  // call before writeStream finish
  fs.rename('/tmp/f/o/o/bar.txt', 'dest.txt', cb)
})

fs.createReadStream('loremipsum.txt').pipe(writeStream)

```

## License

MIT

