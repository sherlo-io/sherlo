import { clearNetworkMocks } from './network';
import { MockSet, ModuleExports } from './types';
import SherloModule from '../SherloModule';
import { restoreClock } from './clock';
import { restoreRandom } from './random';

type Activation = {
  mocks: MockSet;
  // Lazily populated as keys are looked up; guarantees each factory runs once per activation.
  resolved: Map<string, ModuleExports | undefined>;
};

let activeActivation: Activation | null = null;

// Keys that a generated shim has actually registered via createMockable, i.e. modules
// that are really mockable at runtime. Populated as shim modules are evaluated (FG-03).
const shimmedKeys = new Set<string>();

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

function activateMocks(mocks: MockSet): void {
  if (!isMockingModeActive()) return;

  activeActivation = { mocks, resolved: new Map() };
}

// Removes the active mock set; every createMockable trap then passes through to the real module,
// and the real fetch and XMLHttpRequest are back in place (see ./network).
function clearMocks(): void {
  restoreClock();
  restoreRandom();
  activeActivation = null;
  clearNetworkMocks();
}

// Returns the resolved mock exports for `key`, or undefined if the module isn't mocked in the
// active activation (or there is no active activation). Factory definitions are invoked with
// `realModule` on first lookup and cached for the rest of the activation.
function resolveMockExports(key: string, realModule: ModuleExports): ModuleExports | undefined {
  if (!activeActivation) {
    return undefined;
  }

  const { mocks, resolved } = activeActivation;

  if (resolved.has(key)) {
    return resolved.get(key);
  }

  if (!(key in mocks)) {
    resolved.set(key, undefined);
    return undefined;
  }

  const definition = mocks[key];
  const exports = typeof definition === 'function' ? definition(realModule) : definition;
  resolved.set(key, exports);
  return exports;
}

// Called once by createMockable when a shim module is evaluated, i.e. the module is
// really mockable. Idempotent - the module cache guarantees a shim evaluates once anyway.
function registerShimmedKey(key: string): void {
  shimmedKeys.add(key);
}

// Whether `key` has a generated shim that has actually run createMockable. A declared
// mock key that is NOT shimmed can never apply - see warnUnshimmedKeys (FG-03).
function isKeyShimmed(key: string): boolean {
  return shimmedKeys.has(key);
}

/** Test-only: reset shimmedKeys between unit tests so shim registration doesn't leak. */
function __resetShimmedKeysForTests(): void {
  shimmedKeys.clear();
}

export {
  activateMocks,
  clearMocks,
  resolveMockExports,
  registerShimmedKey,
  isKeyShimmed,
  isMockingModeActive,
  __resetShimmedKeysForTests,
};
