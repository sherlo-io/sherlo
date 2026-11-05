import { mergeMockSets } from './mergeDefinitions';
import {
  declarationsOf,
  isModuleDeclaration,
  isNetworkDeclaration,
  StoryMocks,
} from './mockDeclaration';
import { partialReadLine } from './unusedFakeLine';

// A SCENE'S `given` LIST USES THE SAME RULE WITH THE LIST'S ORDER AS THE LEVELS: the fakes of its
// preconditions merge one after the other (activateSceneMocks, in getStorybook/storyMockActivation),
// and for a module two of them name, the later fake merges over the earlier part by part. The fakes
// a shared precondition brings are defaults the scene may leave alone, as a project's are for a story.
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
// NETWORK RULES CARRY THE SAME PRECEDENCE. A request is answered by the LAST rule that matches
// it, so the levels are concatenated project first: the story's rules come last and win over its
// file's, and its file's over the project's. A rule an outer level declared
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
  const networkRules = projectLevel.concat(fileLevel, storyLevel).filter(isNetworkDeclaration);

  return [...moduleMocks, ...networkRules];
}

/* ========================================================================== */

// The fields a partial fake was read for and lacks, in the order they were first read.
const lackedFields = new Set<string>();

// One partial per fake, so a part read twice is the same object.
const partials = new WeakMap<object, object>();

// Reads a promise, a JSON writer or a test runner makes of any object: they are not the screen's.
const PROBES = new Set(['then', 'toJSON', '$$typeof', '__esModule', 'asymmetricMatch', 'nodeType']);

/**
 * A fake that stands alone - no real part beneath it to read through to - is a partial object: it
 * names some of the fields the screen reads. A read of a field it lacks answers undefined, as it
 * always did, and is kept and logged the first time, so a run finds every field the screen read
 * and not only the one it stopped at. The line it logs is the one the CLI reads
 * (cli/src/render/partialRead.ts).
 */
export function partialFake<T extends object>(fake: T): T {
  const made = partials.get(fake);
  if (made) return made as T;

  const partial = new Proxy(fake, {
    get(target, field, receiver) {
      if (typeof field === 'string' && !PROBES.has(field) && !Reflect.has(target, field)) {
        if (!lackedFields.has(field)) {
          lackedFields.add(field);
          console.error(partialReadLine(field));
        }
      }
      return Reflect.get(target, field, receiver);
    },
  });
  partials.set(fake, partial);
  return partial;
}

/** The fields a partial fake was read for and lacks since the last activation, first read first. */
export function lackedFieldsRead(): string[] {
  return Array.from(lackedFields);
}

/** Forgets the lacked fields: a new activation starts with none read. */
export function forgetLackedFields(): void {
  lackedFields.clear();
}

export default mergeStoryMocks;
