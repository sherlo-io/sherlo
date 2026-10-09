import {
  declarationsOf,
  isModuleDeclaration,
  isNetworkDeclaration,
  StoryMocks,
} from './mockDeclaration';

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
//
// NETWORK RULES CARRY THE SAME PRECEDENCE THE OTHER WAY ROUND. A request is answered by the
// FIRST rule that matches it, so the levels are concatenated story first: the story's rules are
// asked before its file's, and its file's before the project's. A rule an outer level declared
// for the same matcher is still there, and still answers every request the inner levels left
// alone - which is what "added to" means for a level that declares rules of its own.
export function mergeStoryMocks(
  global: StoryMocks = {},
  meta: StoryMocks = {},
  story: StoryMocks = {}
): StoryMocks {
  if (!Array.isArray(global) && !Array.isArray(meta) && !Array.isArray(story)) {
    return { ...global, ...meta, ...story };
  }

  const projectLevel = declarationsOf(global);
  const fileLevel = declarationsOf(meta);
  const storyLevel = declarationsOf(story);

  const moduleMocks = projectLevel.concat(fileLevel, storyLevel).filter(isModuleDeclaration);
  const networkRules = storyLevel.concat(fileLevel, projectLevel).filter(isNetworkDeclaration);

  return [...moduleMocks, ...networkRules];
}

export default mergeStoryMocks;
