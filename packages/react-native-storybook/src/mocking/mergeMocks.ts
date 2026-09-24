import { declarationsOf, StoryMocks } from './mockDeclaration';

// Precedence: story > meta > global. For any module, the most specific level that names it
// wins outright - its whole definition replaces what an outer level declared for that module.
// Modules an inner level leaves untouched still come through from whichever outer level
// declared them.
//
// The object form spells its modules out as keys, so spreading global, then meta, then story
// onto one object IS the precedence rule: each pass overwrites only the keys it declares.
// Declarations name their modules by import, so their names are known only once those imports
// resolve; concatenating the levels in the same order carries the same rule to resolution,
// where the later declaration for a module overwrites the earlier one (see
// resolveDeclarations).
export function mergeStoryMocks(
  global: StoryMocks = {},
  meta: StoryMocks = {},
  story: StoryMocks = {}
): StoryMocks {
  if (!Array.isArray(global) && !Array.isArray(meta) && !Array.isArray(story)) {
    return { ...global, ...meta, ...story };
  }

  return declarationsOf(global).concat(declarationsOf(meta), declarationsOf(story));
}

export default mergeStoryMocks;
