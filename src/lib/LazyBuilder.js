import _ from 'lodash';
import getChanges from './getChanges';
import Immutable from 'immutable';
import PairTable from 'pair-table';
import path from 'path';
import Promise from 'bluebird';

const privates = new WeakMap();

const build = Promise.coroutine(function* _build(input) {
  const priv = privates.get(this);

  // prohibit calling twice in parallel
  if (priv.building) {
    throw new Error('You must wait for previous build() to finish before calling build() again.');
  }
  priv.building = true;

  try {
    // validate input
    if (!Immutable.Map.isMap(input)) {
      throw new TypeError('Input must be an immutable map!');
    }

    for (const contents of input.values()) {
      if (!Buffer.isBuffer(contents)) {
        throw new TypeError('input values must all be buffers');
      }
    }

    // unpack private members
    const {
      fn,
      input: oldInput,
      importations: oldImportations,
      causations: oldCausations,
    } = priv;

    // start new mappings tables for this build
    const newImportations = new PairTable(); // <L: buildPath, R: importPath>
    const newCausations = new PairTable();   // <L: buildPath, R: outputPath>

    // determine which input files have changed since last time
    const changedInput = oldInput ? getChanges(oldInput, input) : input;

    // decide which files we need to build
    const filesToBuild = changedInput.withMutations(map => {
      // add any files that are known to import any of these files
      for (const [buildPath, importPath] of oldImportations) {
        if (changedInput.has(importPath)) {
          map.set(buildPath, input.get(buildPath) || null);
        }
      }
    });

    // build everything
    const results = yield Promise.props(
      filesToBuild
        .filter(contents => contents)
        .map((contents, buildPath) => {
          // make a simple context for the fn, providing `this.importFile()`
          const context = {
            importFile: importee => {
              // console.assert(
              //   !path.isAbsolute(importee),
              //   'importFile should not be used for absolute paths'
              // );

              newImportations.add(buildPath, importee);

              return input.get(importee) || null;
            },
          };

          return Promise.resolve().then(() => fn.call(context, buildPath, contents));
        })
        .toObject()
    );

    // record output paths so we can check that no path gets output from two different inputs
    const allOutputPaths = {}; // {[outputPath]: buildPath}

    // process the results to determine output
    const outputWrites = {};
    for (const buildPath of filesToBuild.keys()) {
      let result = results[buildPath];

      if (!result) continue;

      // start preparing some info about this atomic build job, to emit later
      // const info = {buildPath};

      // normalise the structure of the result
      {
        // if it's a single buffer/string, this is an instruction
        // to output to the exact same path
        if (Buffer.isBuffer(result) || _.isString(result)) {
          const newContents = result;
          result = { [buildPath]: newContents };
        } else if (!_.isPlainObject(result)) {
          throw new TypeError(
            'LazyBuilder callback\'s return value is of invalid type ' +
            `(${typeof result}) when building "${buildPath}"`
          );
        }
      }

      // note what was imported by this file
      // info.imported = newImportations.getRightsFor(buildPath);

      // and see what was output
      const outputPaths = Object.keys(result);
      // info.output = outputPaths;

      // process the result for this file
      for (let outputPath of outputPaths) {
        // first ensure this output path is uniquely output by a single input path
        // (because if we were to just pick one, results might be undeterministic)
        {
          const otherInputFile = allOutputPaths[outputPath];

          if (otherInputFile) {
            throw new Error(
              `LazyBuilder: when building "${buildPath}"` +
              `the fn tried to output to "${outputPath}", but this has already ` +
              `been output by "${otherInputFile}"`
            );
          }

          allOutputPaths[outputPath] = buildPath;
        }

        // make sure it's a buffer
        let contents = result[outputPath];
        if (_.isString(contents)) contents = new Buffer(contents);
        else if (!Buffer.isBuffer(contents)) {
          throw new TypeError(
            `LazyBuilder: Expected value for output file "${outputPath}" ` +
            `to be string or buffer; got ${typeof contents}.`
          );
        }

        // make sure the path is normal (should be relative, with no "./" or "../")
        if (path.isAbsolute(outputPath)) {
          throw new Error(`LazyBuilder: Expected a relative path, got: ${outputPath}`);
        }
        outputPath = path.normalize(outputPath);

        // add it to the output
        outputWrites[outputPath] = contents;

        // and note the new causation
        newCausations.add(buildPath, outputPath);
      }
    }

    // status: the output now contains everything that got written on this build
    // - but we also need to return all other *unaffected* files at the end.

    // fill in the gaps in the new mappings (causations and importations) with
    // those from the previous build - i.e. any where the build path was not
    // rebuilt this time
    {
      // carry over output mappings
      for (const [oldBuildPath, oldOutputPath] of oldCausations) {
        if (!filesToBuild.has(oldBuildPath)) newCausations.add(oldBuildPath, oldOutputPath);
      }

      // carry over import mappings
      for (const [oldBuildPath, oldResolvedImportPath] of oldImportations) {
        if (!filesToBuild.has(oldBuildPath)) {
          newImportations.add(oldBuildPath, oldResolvedImportPath);
        }
      }
    }

    // see what needs deleting - anything that was output last build, but
    // was *not* output on this build
    const toDelete = new Set();
    {
      const oldOutputPaths = oldCausations.getAllRights();
      const newOutputPaths = newCausations.getAllRights();
      for (const file of oldOutputPaths) {
        if (!newOutputPaths.has(file)) toDelete.add(file);
      }
    }

    // augment the output with output from last time - carry over anything that
    // wasn't output this time and isn't in toDelete
    if (priv.output) {
      priv.output.forEach((contents, file) => {
        // console.assert(Buffer.isBuffer(contents));

        if (!outputWrites[file] && !toDelete.has(file)) {
          outputWrites[file] = contents;
        }
      });
    }

    // finalise the output
    const output = Immutable.Map(outputWrites);

    // finish up and resolve with the output
    priv.importations = newImportations;
    priv.causations = newCausations;
    priv.input = input;
    priv.output = output;
    priv.building = false;

    return Immutable.Map(output);
  } catch (error) {
    priv.building = false;
    throw error;
  }
});

export default class LazyBuilder {
  constructor(_fn) {
    const fn = _fn.constructor.name === 'GeneratorFunction'
      ? Promise.coroutine(_fn)
      : _fn;

    privates.set(this, {
      fn,
      importations: new PairTable(),
      causations: new PairTable(),
    });

    this.build = build.bind(this);
  }
}
