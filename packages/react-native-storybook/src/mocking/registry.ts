import { clearNetworkMocks } from './network';
import { rulesInEffect, unmatchedRules } from './networkRules';
import { MockSet, ModuleExports } from './types';
import SherloModule from '../SherloModule';
import { restoreClock } from './clock';
import { restoreRandom } from './random';

/**
 * What one story's mocks met while the story was on screen: the mocked modules a read reached, and
 * the real imports that threw. It belongs to the story, not to one activation of it. Storybook does
 * not render a story again when it is selected while already on screen (it answers
 * STORY_UNCHANGED), so a second activation of the same story - a second capture of it in a row -
 * sees no read at all: only the reads its one render made say whether its mocks applied.
 */
type MockLookups = {
  storyId: string | undefined;
  reached: Set<string>;
  // The message each mocked module's real import threw, by key.
  realImportThrew: Map<string, string>;
  // Each mocked module's name as the story wrote it, by the key it is installed under.
  namesAsWritten: Map<string, string>;
  // The keys the story or its file declare. A project mock is a default most stories never read,
  // so reaching nothing fails the story only for these.
  declaredByStory: Set<string>;
  // Whether the screen has been judged: its stillness check ran, or its ready wait ran out. An
  // app booted as the scene (../storyReady) first imports a mocked module as it renders, well after
  // activation, so only from then on is a mock no read reached one that reached nothing.
  settled: boolean;
};

function newMockLookups(storyId: string | undefined): MockLookups {
  return {
    storyId,
    reached: new Set(),
    realImportThrew: new Map(),
    namesAsWritten: new Map(),
    declaredByStory: new Set(),
    settled: false,
  };
}

type Activation = {
  mocks: MockSet;
  // Lazily populated as keys are looked up; guarantees each factory runs once per activation.
  resolved: Map<string, ModuleExports | undefined>;
  // Writes a story made to a mocked module's exports, per module key. Dropped with the activation.
  overrides: Map<string, Map<PropertyKey, PropertyDescriptor>>;
  // Puts back what a story changed on a real object (a default-exported singleton's fields).
  undo: Array<() => void>;
  lookups: MockLookups;
};

// The name both failures of a mock carry, the one the CLI prints its own screen for.
const MOCKED_MODULE_ERROR_NAME = 'MockedModuleError';

let activeActivation: Activation | null = null;

// ONE COPY OF THIS MODULE MAY RUN. A second copy has its own active mocks, so the shims that read
// it never meet the mocks the first copy was handed, and every mock silently misses. An app gets
// two copies when package exports are off and the SDK's files resolve once by "main" and once by
// "exports"; loading says so here instead of failing story by story.
const REGISTRY_LOADED_FLAG = '__sherloMockRegistryLoaded';
{
  const host = globalThis as Record<string, unknown>;
  if (host[REGISTRY_LOADED_FLAG]) {
    throw new Error(
      'Sherlo loaded its mock registry twice, so no mock can reach the module it names. This happens ' +
        'when package exports are off: set resolver.unstable_enablePackageExports to true in metro.config.js'
    );
  }
  host[REGISTRY_LOADED_FLAG] = true;
}

// Keys that a generated shim has actually registered via createMockable, i.e. modules
// that are really mockable at runtime. Populated as shim modules are evaluated (FG-03).
const shimmedKeys = new Set<string>();

// Keys whose module was read while no mock of them was on. What the app built from such a read - an
// MMKV instance made at module scope - holds the real module, and no later mock reaches it.
const builtBeforeMock = new Set<string>();

// Installs the mock set for one story, replacing any previously active set.
//
// Defense-in-depth (SHERLO-1765 B2): activation is a no-op outside 'testing' and
// 'storybook' modes, mirroring the guard in helpers/RunnerBridge/actions/log.ts.
// A production app reports 'default', so even a stray activation call there leaves
// every createMockable trap passing straight through to the real module. This is
// the single choke point - activateStoryMocks delegates here, so both public entry
// points are covered. Interactive 'storybook' mode is a legitimate mock context and
// is intentionally NOT blocked.
// The same check clock/random installation gates on (activateStoryMocks), so a shipped app -
// which reports 'default' - never installs any of it.
function isMockingModeActive(): boolean {
  const mode = SherloModule.getMode();
  return mode === 'testing' || mode === 'storybook';
}

// `lookups` is the record the reads of this activation go to: the caller hands the same one back
// for another activation of the story that is still on screen.
function activateMocks(mocks: MockSet, lookups: MockLookups = newMockLookups(undefined)): void {
  if (!isMockingModeActive()) return;

  endActivation();
  activeActivation = { mocks, resolved: new Map(), overrides: new Map(), undo: [], lookups };
}

// The mock set in effect and the record of what its story's reads met, or null with none active.
function activeMockLookups(): { mocks: MockSet; lookups: MockLookups } | null {
  return activeActivation && { mocks: activeActivation.mocks, lookups: activeActivation.lookups };
}

// A mocked module's real import threw `message`: recorded for the story when the active mocks mock
// `key`, answering the module's name as the story wrote it; undefined when no mock of it is active.
function recordRealImportThrew(key: string, message: string): string | undefined {
  if (!activeActivation || !(key in activeActivation.mocks)) return undefined;
  const { lookups } = activeActivation;
  lookups.realImportThrew.set(key, message);
  return lookups.namesAsWritten.get(key) ?? key;
}

// The scene whose mocks are in effect has been judged on screen (see MockLookups' `settled`).
function markStorySettled(): void {
  if (activeActivation) activeActivation.lookups.settled = true;
}

// Positive proof that `storyId`'s rules are the ones in effect: how many module mocks, request
// rules and socket rules went in. A record that says nothing of its rules cannot tell a scene with
// none from a scene whose rules never went in.
function rulesInstalledProof(storyId: string): {
  installed: boolean;
  modules: number;
  requests: number;
  sockets: number;
} {
  const active = activeActivation;
  if (!active || active.lookups.storyId !== storyId) {
    return { installed: false, modules: 0, requests: 0, sockets: 0 };
  }
  return { installed: true, modules: Object.keys(active.mocks).length, ...rulesInEffect() };
}

// The rules in effect that were never used: a declared module mock no read reached, and a request
// or socket rule nothing matched. Empty when no rules are in effect.
function rulesNeverMatched(): string[] {
  if (!activeActivation) return [];
  const { mocks, lookups } = activeActivation;
  const modules = Object.keys(mocks)
    .filter((key) => lookups.declaredByStory.has(key) && !lookups.reached.has(key))
    .map((key) => `module ${lookups.namesAsWritten.get(key) ?? key}`);
  return [...modules, ...unmatchedRules()];
}

// Puts back what the ending story wrote to real objects, newest write first.
function endActivation(): void {
  activeActivation?.undo.reverse().forEach((undo) => undo());
  activeActivation = null;
}

// Removes the active mock set; every createMockable trap then passes through to the real module,
// and the real fetch and XMLHttpRequest are back in place (see ./network).
function clearMocks(): void {
  restoreClock();
  restoreRandom();
  endActivation();
  clearNetworkMocks();
}

// Returns the resolved mock exports for `key`, or undefined if the module isn't mocked in the
// active activation (or there is no active activation). Factory definitions are invoked with
// the real module on first lookup and cached for the rest of the activation. A stand-in whose real
// module loads lazily passes `loadRealModule` instead, so the real module loads only for a factory.
function resolveMockExports(
  key: string,
  realModule: ModuleExports | undefined,
  loadRealModule?: () => ModuleExports
): ModuleExports | undefined {
  if (!activeActivation) {
    return undefined;
  }

  const { mocks, resolved, lookups } = activeActivation;

  // Every read of a mocked module asks here first, so this is where a mock is known to be reached.
  if (key in mocks) lookups.reached.add(key);

  if (resolved.has(key)) {
    return resolved.get(key);
  }

  if (!(key in mocks)) {
    resolved.set(key, undefined);
    return undefined;
  }

  const definition = mocks[key];
  const exports =
    typeof definition === 'function'
      ? definition(loadRealModule ? loadRealModule() : (realModule as ModuleExports))
      : definition;
  resolved.set(key, exports);
  return exports;
}

// The story's writes to module `key`, or undefined when no story is active (a write then goes
// to the real module). Gone when the story's mocks end.
function getOverrides(key: string): Map<PropertyKey, PropertyDescriptor> | undefined {
  if (!activeActivation) return undefined;
  const { overrides } = activeActivation;
  if (!overrides.has(key)) overrides.set(key, new Map());
  return overrides.get(key);
}

// Registers how to undo a write to a real object; returns false when no story is active (the
// write is then permanent, as it would be without the shim).
function recordUndo(undo: () => void): boolean {
  if (!activeActivation) return false;
  activeActivation.undo.push(undo);
  return true;
}

// Called once by createMockable when a shim module is evaluated, i.e. the module is
// really mockable. Idempotent - the module cache guarantees a shim evaluates once anyway.
function registerShimmedKey(key: string): void {
  shimmedKeys.add(key);
}

// An export of module `key` is being read: remembered when no mock of it is on, as that read hands
// the app the real export.
function recordRealRead(key: string): void {
  if (!activeActivation || !(key in activeActivation.mocks)) builtBeforeMock.add(key);
}

// Whether the module `key` was built before any mock of it was on (see builtBeforeMock).
function wasBuiltBeforeMock(key: string): boolean {
  return builtBeforeMock.has(key);
}

// Whether `key` has a generated shim that has actually run createMockable. A declared
// mock key that is NOT shimmed can never apply (see mockFailureOf in ./activateStoryMocks).
function isKeyShimmed(key: string): boolean {
  return shimmedKeys.has(key);
}

/** Test-only: reset shimmedKeys between unit tests so shim registration doesn't leak. */
function __resetShimmedKeysForTests(): void {
  shimmedKeys.clear();
  builtBeforeMock.clear();
}

export type { MockLookups };
export {
  MOCKED_MODULE_ERROR_NAME,
  newMockLookups,
  activeMockLookups,
  recordRealImportThrew,
  markStorySettled,
  rulesInstalledProof,
  rulesNeverMatched,
  activateMocks,
  clearMocks,
  resolveMockExports,
  getOverrides,
  recordUndo,
  registerShimmedKey,
  isKeyShimmed,
  recordRealRead,
  wasBuiltBeforeMock,
  isMockingModeActive,
  __resetShimmedKeysForTests,
};
