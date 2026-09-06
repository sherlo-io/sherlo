import { MockSet } from './types';

// Precedence: story > meta > global. For any module key, the most specific level that
// declares it wins outright - its whole mock definition replaces what an outer level
// declared for that key. Keys an inner level leaves untouched still come through from
// whichever outer level declared them. Spreading global, then meta, then story - in that
// order - onto one object is the precedence rule: each pass overwrites only the keys it
// actually declares.
export function mergeMockSet(
  global: MockSet = {},
  meta: MockSet = {},
  story: MockSet = {}
): MockSet {
  return { ...global, ...meta, ...story };
}

export default mergeMockSet;
