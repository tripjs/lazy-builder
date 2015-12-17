/* global describe, it */

import assert from 'assert';
import Immutable from 'immutable';
import LazyBuilder from '../lib/LazyBuilder';
import prettyHRTime from 'pretty-hrtime';
import Promise from 'bluebird';

function simplify(map) {
  return map.map(buffer => buffer.toString()).toObject();
}

describe('LazyBuilder', () => {
  // initial input
  let input = Immutable.Map({
    'foo.bar': 'misc contents',
    'something.js': `console.log('hello');`,
    'banner.txt': 'Copyright Alphabet 1980',
  }).map(string => new Buffer(string));

  let output;

  // builder
  const builder = new LazyBuilder(function (file, contents) {
    if (file === 'banner.txt') return null;

    if (file.endsWith('.js')) {
      const banner = this.importFile('banner.txt');

      return {
        [file]: `/* ${banner} */\n${contents}`,
        [`${file}.uppercase`]: contents.toString().toUpperCase(),
      };
    }

    return contents;
  });

  it('starting from scratch', () => {
    return builder.build(input)
      .then(_output => {
        output = _output;

        assert(Immutable.Map.isMap(output), 'should be a map');

        assert.deepEqual(simplify(output), {
          'foo.bar': 'misc contents',
          'something.js': (
            `/* Copyright Alphabet 1980 */\n` +
            `console.log('hello');`
          ),
          'something.js.uppercase': `CONSOLE.LOG('HELLO');`,
        }, 'expected output');
      })
    ;
  });

  it('modifying a misc file', () => {
    input = input.set('foo.bar', new Buffer('updated misc contents!'));

    return builder.build(input).then(_output => {
      output = _output;

      assert.deepEqual(simplify(output), {
        'foo.bar': 'updated misc contents!',
        'something.js': (
          `/* Copyright Alphabet 1980 */\n` +
          `console.log('hello');`
        ),
        'something.js.uppercase': `CONSOLE.LOG('HELLO');`,
      }, 'expected output');
    });
  });

  it('modifiying an importee that affects multiple output files', () => {
    input = input.set('banner.txt', new Buffer('Copyright Zebra 2051'));

    return builder.build(input).then(_output => {
      output = _output;

      assert.deepEqual(simplify(output), {
        'foo.bar': 'updated misc contents!',
        'something.js': (
          `/* Copyright Zebra 2051 */\n` +
          `console.log('hello');`
        ),
        'something.js.uppercase': `CONSOLE.LOG('HELLO');`,
      }, 'expected output');
    });
  });

  it('modifying the JS contents', () => {
    input = input.set('something.js', new Buffer(`console.log('changed!');`));

    return builder.build(input).then(_output => {
      output = _output;

      assert.deepEqual(simplify(output), {
        'foo.bar': 'updated misc contents!',
        'something.js': (
          `/* Copyright Zebra 2051 */\n` +
          `console.log('changed!');`
        ),
        'something.js.uppercase': `CONSOLE.LOG('CHANGED!');`,
      }, 'expected output');
    });
  });

  it('adding more files', () => {
    input = input.set('another.js', new Buffer(`anotherScript();`));

    return builder.build(input).then(_output => {
      output = _output;

      assert.deepEqual(simplify(output), {
        'foo.bar': 'updated misc contents!',
        'something.js': (
          `/* Copyright Zebra 2051 */\n` +
          `console.log('changed!');`
        ),
        'something.js.uppercase': `CONSOLE.LOG('CHANGED!');`,
        'another.js': (
          `/* Copyright Zebra 2051 */\n` +
          `anotherScript();`
        ),
        'another.js.uppercase': `ANOTHERSCRIPT();`,
      }, 'expected output');
    });
  });

  it('changing the imported banner and one of the scripts at the same time', () => {
    input = input.merge({
      'banner.txt': new Buffer('Copyright Whatever 1999'),
      'another.js': new Buffer('yup()'),
    });

    return builder.build(input).then(_output => {
      output = _output;

      assert.deepEqual(simplify(output), {
        'foo.bar': 'updated misc contents!',
        'something.js': (
          `/* Copyright Whatever 1999 */\n` +
          `console.log('changed!');`
        ),
        'something.js.uppercase': `CONSOLE.LOG('CHANGED!');`,
        'another.js': (
          `/* Copyright Whatever 1999 */\n` +
          `yup()`
        ),
        'another.js.uppercase': `YUP()`,
      }, 'expected output');
    });
  });

  it('deleting a file', () => {
    input = input.remove('another.js');

    return builder.build(input).then(_output => {
      output = _output;

      assert.deepEqual(simplify(output), {
        'foo.bar': 'updated misc contents!',
        'something.js': (
          `/* Copyright Whatever 1999 */\n` +
          `console.log('changed!');`
        ),
        'something.js.uppercase': `CONSOLE.LOG('CHANGED!');`,
      }, 'expected output');
    });
  });

  it('deleting everything', () => {
    input = input.clear();
    // input = input.set('foo.bar', 'fuck');

    return builder.build(input).then(_output => {
      output = _output;

      assert.deepEqual(simplify(output), {
        // nothing!
      });
    });
  });

  it('stress test', function () {
    // this is just for informal observations

    this.timeout(20000);
    input = input.clear();

    const buf1 = new Buffer(12).fill(0);
    const buf2 = new Buffer(80).fill(2);
    const buf3 = new Buffer('asdfasdfasdf');
    const buf4 = new Buffer('fdsafds');
    const buf5 = new Buffer('aiousdhfioasdf');

    const start = process.hrtime();

    Promise.mapSeries(new Array(200), (x, i) => {
      const occasional1 = (i % 5 === 0);
      const occasional2 = (i % 3 === 0);
      const occasional3 = (i % 11 === 0);

      input = input.merge({
        'banner.txt': buf5,
        [`foo${i}.bar`]: buf1,
        [`something${occasional3 ? 'x' : ''}.js`]: occasional1 ? buf3 : buf4,
      });

      if (occasional1) input = input.set(`another.js`, buf5);

      if (occasional2) {
        input = input.merge({
          'another.bar': buf2,
          'whatever.random': buf1,
        });
      }

      if (occasional3) input = input.set(`yetanother.js`, buf4);

      return builder.build(input).then(() => null);
    }).then(() => {
      const duration = process.hrtime(start);

      console.log('\nSTRESS TEST DURATION:', prettyHRTime(duration));
    });
  });
});

