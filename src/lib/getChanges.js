import Immutable from 'immutable';

/**
 * Takes an old map and a new map, and returns a final map of changes. This
 * includes nulls for those files that have been removed.
 */

export default function getChanges(oldMap, newMap) {
  const changes = {};

  for (const file of new Set([...oldMap.keys(), ...newMap.keys()])) {
    const newContents = newMap.get(file);

    if (newContents) {
      if (newContents !== oldMap.get(file)) changes[file] = newContents;
    }
    else changes[file] = null;
  }

  return Immutable.Map(changes);
}
