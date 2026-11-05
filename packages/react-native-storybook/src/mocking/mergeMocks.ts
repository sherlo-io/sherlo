import { mergeMockSets } from './mergeDefinitions';
import {
  declarationsOf,
  isModuleDeclaration,
  isNetworkDeclaration,
  StoryMocks,
} from './mockDeclaration';

// A SCENE FILE USES THE SAME RULE WITH ONE LEVEL LESS: the file's mocks sit under the scene's own
// (as `global` and `story`), so a scene's mocks are its file's plus its own, and for a module both
// name the scene's fake merges over the file's part by part (activateSceneMocks, in
// getStorybook/storyMockActivation). The file's are shared defaults, as a project's are for a story.
//
// Precedence: story > meta > global. For any module, the fakes of the levels that name it merge
// part by part, recursively for nested objects: the most specific level that names a part wins
// that part, and a part it leaves out still comes from an outer level. A factory, or a part that
// is a function or a class, is the more specific one whole. Modules an inner level leaves
// untouched still come through from whichever outer level declared them.
//
// The object form spells its modules out as keys, so merging global, then meta, then story onto
// one object IS the precedence rule. Declarations name their modules by import, so their names are
// known only once those imports resolve; concatenating the levels in the same order carries the
// same rule to resolution, where a later declaration for a module merges over the earlier one (see
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
    return mergeMockSets(global, meta, story);
  }

  const projectLevel = declarationsOf(global);
  const fileLevel = declarationsOf(meta);
  const storyLevel = declarationsOf(story);

  const moduleMocks = projectLevel.concat(fileLevel, storyLevel).filter(isModuleDeclaration);
  const networkRules = storyLevel.concat(fileLevel, projectLevel).filter(isNetworkDeclaration);

  return [...moduleMocks, ...networkRules];
}

export default mergeStoryMocks;
