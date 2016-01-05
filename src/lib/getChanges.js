/**
 * Takes an old map and a new map, and returns a map of changes needed to get
 * from the old to the new. This may include nulls for deletions.
 */

import {Immutable} from '@trip/util';

export default function getChanges(oldMap, newMap) {
  const changes = {};

  for (const file of new Set([...oldMap.keys(), ...newMap.keys()])) {
    const newContents = newMap.get(file);

    if (!newContents) changes[file] = null;
    else if (newContents !== oldMap.get(file)) changes[file] = newContents;
  }

  return Immutable.Map(changes);
}
