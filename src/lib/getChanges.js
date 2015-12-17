import Immutable from 'immutable';

/**
 * Takes an old map and a new map, and returns a final map of changes. This
 * includes nulls for those files that have been removed.
 */

export default function getChanges(oldMap, newMap) {
  const changes = {};

  for (const [file, oldContents] of oldMap.entries()) {
    const newContents = newMap.get(file);

    if (newContents) {
      if (newContents !== oldContents) {
        changes[file] = newContents;
      }
    }
    else changes[file] = null;
  }

  for (const [file, newContents] of newMap.entries()) {
    if (changes[file] === undefined) changes[file] = newContents;
  }

  return Immutable.Map(changes);
}
