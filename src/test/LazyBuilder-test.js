/* global describe, it */

import LazyBuilder from '../lib/LazyBuilder';
import Immutable from 'immutable';
import assert from 'assert';

function simplify(map) {
  return map.map(buffer => buffer.toString()).toObject();
}

describe('LazyBuilder', () => {
  // initial input
  let input = Immutable.Map({
    'foo.bar': 'misc contents',
    'some/script.js': `console.log('hello');`,
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
          'some/script.js': (
            `/* Copyright Alphabet 1980 */\n` +
            `console.log('hello');`
          ),
          'some/script.js.uppercase': `CONSOLE.LOG('HELLO');`,
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
        'some/script.js': (
          `/* Copyright Alphabet 1980 */\n` +
          `console.log('hello');`
        ),
        'some/script.js.uppercase': `CONSOLE.LOG('HELLO');`,
      }, 'expected output');
    });
  });

  it('modifiying an importee that affects multiple output files', () => {
    input = input.set('banner.txt', new Buffer('Copyright Zebra 2051'));

    return builder.build(input).then(_output => {
      output = _output;

      assert.deepEqual(simplify(output), {
        'foo.bar': 'updated misc contents!',
        'some/script.js': (
          `/* Copyright Zebra 2051 */\n` +
          `console.log('hello');`
        ),
        'some/script.js.uppercase': `CONSOLE.LOG('HELLO');`,
      }, 'expected output');
    });
  });

  it('modifying the JS contents', () => {
    input = input.set('some/script.js', new Buffer(`console.log('changed!');`));

    return builder.build(input).then(_output => {
      output = _output;

      assert.deepEqual(simplify(output), {
        'foo.bar': 'updated misc contents!',
        'some/script.js': (
          `/* Copyright Zebra 2051 */\n` +
          `console.log('changed!');`
        ),
        'some/script.js.uppercase': `CONSOLE.LOG('CHANGED!');`,
      }, 'expected output');
    });
  });

  it('adding more files', () => {
    input = input.set('another.js', new Buffer(`anotherScript();`));

    return builder.build(input).then(_output => {
      output = _output;

      assert.deepEqual(simplify(output), {
        'foo.bar': 'updated misc contents!',
        'some/script.js': (
          `/* Copyright Zebra 2051 */\n` +
          `console.log('changed!');`
        ),
        'some/script.js.uppercase': `CONSOLE.LOG('CHANGED!');`,
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
        'some/script.js': (
          `/* Copyright Whatever 1999 */\n` +
          `console.log('changed!');`
        ),
        'some/script.js.uppercase': `CONSOLE.LOG('CHANGED!');`,
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
        'some/script.js': (
          `/* Copyright Whatever 1999 */\n` +
          `console.log('changed!');`
        ),
        'some/script.js.uppercase': `CONSOLE.LOG('CHANGED!');`,
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
});
