# lazy-builder

Utility for lazily rebuilding an [immutable map] of files.

This is a micro-framework for use inside a trip plugin. It helps reduce repeat work on partial rebuilds.

[![NPM version][npm-image]][npm-url] [![Linux Build Status][travis-image]][travis-url] [![Windows Build Status][appveyor-image]][appveyor-url] [![Dependency Status][depstat-image]][depstat-url] [![devDependency Status][devdepstat-image]][devdepstat-url] [![peerDependency Status][peerdepstat-image]][peerdepstat-url]


## Usage

```js
const builder = new LazyBuilder(fn);

builder.build(inputFiles).then(outputFiles => {
  // do something with result...
});
```

The `fn` is your own 'granular build function'.

The first time `.build()` is called, it simply calls `fn(key, value)` for every file in the map, and returns a promise of the aggregated results.

But on subsequent calls to `.build()` (with a slightly modified input map each time), the builder will call your `fn` only for the files that actually need rebuilding – those that have changed, plus those that are known to import any of those that have changed.


### The .build() method

- Takes an [immutable map] of files, processes them according to your granular callback, and returns the results an immutable map of files. For example, if you're using LazyBuilder as a Sass build step, your input files might include `.html`, `.scss` and `.js` files, and the output files would include the same files except for all the entry `.scss` files are now `.css` files, and all the Sass partials (`_*.scss`) are gone.


### Your granular build function

The instance is constructed with a single function responsible for handling a single input file at a time, and returning/promising whatever build artifacts you want to output in respect of that input file. Whenever you call `.build()`, the instance calls your callback multiple times in parallel (once for each file that actually needs rebuilding), and collects all the output files (along with output from previous builds where appropriate) into a new immutable map, and resolves the `.build()` promise with this map.

```js
new LazyBuilder(function (file, contents) {
  // return or promise something
})
```

#### Arguments

Your callback should return (or promise) whatever file(s) you want to output in respect of the given input file.

#### Return value

You may return any of the following (or a promise that will eventually be fulfilled with one of the following):

- To output no files, return `null`. (You cannot return `undefined`; you must be explicit.)
- If you want to output one or more files in respect of the given input file, you should return an object with file paths as keys and buffers/strings as values, like in the above CoffeeScript example.
- For the common case that you're returning some new contents to be output to the exact same path that was passed in as the first argument, you may return a buffer/string on its own.

#### Importing other files

##### this.importFile(file)

If your build step needs to satisfy statements like `@import 'foo'` or `require('./foo')` (in whatever language you're building), you should use `this.importFile(file)` rather than just reading it directly from the input files map. This gets you the contents (like `inputFiles.get(file)`) but it also *registers* the import, i.e. it tells the builder that file A imports file B. This allows the builder to maintain a list of importer–importee relationships between all the input files, so it can correctly determine the minimal set of files that need to be rebuilt when given input files have changed. It also


### Example

A builder that compiles CoffeeScript files:

```js
import {compile} from 'coffee-script';

const builder = new LazyBuilder(function (file, contents) {
  // pass on non-coffee files
  if (!/\.coffee$/.test(file)) return contents;
  
  // compile the coffeescript to get some JS and a sourcemap
  const {js, v3SourceMap} = compile(contents.toString(), {
    bare: false,
    header: false,
    sourceMap: true,
    sourceRoot: false,
    filename: file,
  });
  
  // output 2 files
  const jsFile = file.replace(/\.coffee$/, '.js');
  return {
    [jsFile]: js,
    [jsFile + '.map']: JSON.stringify(v3SourceMap),
  };
});
```


## License

[MIT](./LICENSE) © [Callum Locke](http://callumlocke.com/)

<!-- badge URLs -->
[npm-url]: https://npmjs.org/package/lazy-builder
[npm-image]: https://img.shields.io/npm/v/lazy-builder.svg?style=flat-square

[travis-url]: https://travis-ci.org/tripjs/lazy-builder
[travis-image]: https://img.shields.io/travis/tripjs/lazy-builder.svg?style=flat-square&label=Linux

[appveyor-url]: https://ci.appveyor.com/project/callumlocke/lazy-builder
[appveyor-image]: https://img.shields.io/appveyor/ci/callumlocke/lazy-builder/master.svg?style=flat-square&label=Windows

[depstat-url]: https://david-dm.org/tripjs/lazy-builder
[depstat-image]: https://img.shields.io/david/tripjs/lazy-builder.svg?style=flat-square

[devdepstat-url]: https://david-dm.org/tripjs/lazy-builder#info=devDependencies
[devdepstat-image]: https://img.shields.io/david/dev/tripjs/lazy-builder.svg?style=flat-square&label=devDeps

[peerdepstat-url]: https://david-dm.org/tripjs/lazy-builder#info=peerDependencies
[peerdepstat-image]: https://img.shields.io/david/peer/tripjs/lazy-builder.svg?style=flat-square&label=peerDeps

<!-- links -->

[immutable map]: https://facebook.github.io/immutable-js/docs/#/Map
