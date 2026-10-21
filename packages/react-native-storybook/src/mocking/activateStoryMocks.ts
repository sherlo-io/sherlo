import { activateMocks, isKeyShimmed, isMockingModeActive, unreachedMockKeys } from './registry';
import { isUnshimmedImportName } from './mockDeclaration';
import { MockSet } from './types';
import { CLOCK_MOCK_KEY, ClockDefinition, installClock, restoreClock } from './clock';
import { RANDOM_MOCK_KEY, RandomDefinition, installRandom, restoreRandom } from './random';
import RunnerBridge from '../helpers/RunnerBridge';
import SherloModule from '../SherloModule';

// Stable log key the runner (and the FG-03 device test) tails from log.sherlo.
export const UNSHIMMED_KEYS_LOG = 'mock declared but unshimmed';

// FG-03: a key declared in `sherlo.mocks` with no generated shim can never take effect -
// the module import was never redirected, so createMockable never ran for it (typically
// a static-scan miss, or a key added after the last Metro start). Warn loudly, once per
// activation, naming the key and both fixes - callers must call this only once shims have
// had the chance to load. Activation reads only the selected story (./storyMocksOf),
// which loads that story's own file. In a test run the sealed core's enumerateStories has
// already loaded every story file first, so every shim has evaluated and the guard holds. With
// no core (Expo Go), a project-level mock whose shim sits only in ANOTHER story's import graph
// may not have evaluated yet, and is warned about though it would apply once that story loads.
//
// The warning goes out on TWO channels: the phone's console (printOnThePhoneConsole) AND
// RunnerBridge.log (written to log.sherlo), which the runner reads during a run.
function warnUnshimmedKeys(unshimmedKeys: string[]): void {
  if (unshimmedKeys.length === 0) return;

  const keyList = unshimmedKeys.map((key) => `"${key}"`).join(', ');
  const plural = unshimmedKeys.length > 1;

  const message =
    `Sherlo: mock declared but unshimmed for ${keyList}. ` +
    `${
      plural ? 'These mocks' : 'This mock'
    } will not apply. Restart Metro so the build-time scan ` +
    `can find ${plural ? 'newly added keys' : 'a newly added key'}, or, if ${
      plural ? 'the keys are' : 'the key is'
    } composed at runtime, list ${
      plural ? 'them' : 'it'
    } under the mockModules option of withStorybook in metro.config.js.`;

  printOnThePhoneConsole(message);
  RunnerBridge.log(UNSHIMMED_KEYS_LOG, { keys: unshimmedKeys });
}

// React Native's own native log, the one console.warn writes through: on Android it lands in
// logcat as ReactNativeJS. Level 2 is a warning.
const NATIVE_LOG_WARNING_LEVEL = 2;

// console.warn, and in testing mode - where setupErrorSilencing has replaced console.warn with a
// no-op - React Native's native log directly, so a phone in a run still prints the warning.
function printOnThePhoneConsole(message: string): void {
  const nativeLog = (globalThis as { nativeLoggingHook?: (text: string, level: number) => void })
    .nativeLoggingHook;
  if (SherloModule.getMode() === 'testing' && typeof nativeLog === 'function') {
    nativeLog(message, NATIVE_LOG_WARNING_LEVEL);
    return;
  }
  console.warn(message);
}

// Reads the clock/random declarations back off the same channel a module mock rides in on
// (mockClock/mockRandom), installs or restores each, and returns the remaining module mocks.
// Gated on the same mode activateMocks itself gates on, so a shipped app installs neither.
function applyClockAndRandom(mocks: MockSet): MockSet {
  const { [CLOCK_MOCK_KEY]: clock, [RANDOM_MOCK_KEY]: random, ...moduleMocks } = mocks;
  const active = isMockingModeActive();

  if (active && clock) installClock((clock as unknown as ClockDefinition).moment);
  else restoreClock();

  if (active && random) installRandom((random as unknown as RandomDefinition).seed);
  else restoreRandom();

  return moduleMocks;
}

// Installs `mocks` as the active set for one story (replacing whatever was active
// before) and flags any declared key that has no generated shim.
export function activateStoryMocks(mocks: MockSet): void {
  const moduleMocks = applyClockAndRandom(mocks);
  activateMocks(moduleMocks);
  warnUnshimmedKeys(Object.keys(moduleMocks).filter((key) => !isKeyShimmed(key)));
}

// Installs `mocks` as the active set for one story and says nothing about what the story reaches.
//
// A shim that has not run YET is not a shim that never will: with inlineRequires a module is
// required where it is first used, which for a component under test is after the story starts to
// render. So the registry of evaluated shims cannot tell, at this moment, a mock that will apply
// from one that reaches nothing - activateStoryMocks's warning is wrong for the first, and a
// warning that can be wrong cannot fail a story. The one moment that can tell is when the story
// has rendered: see unreachedMocksOfActiveStory. The only thing certain now is an import that
// settled on a module that is no stand-in (warnUnnamedImports).
export function installStoryMocks(mocks: MockSet): void {
  activateMocks(applyClockAndRandom(mocks));
}

// Warns about each declaration whose import settled on a module that is no stand-in. Called with
// the set installStoryMocks installed.
export function warnUnnamedImports(mocks: MockSet): void {
  warnUnshimmedKeys(Object.keys(mocks).filter(isUnshimmedImportName));
}

// The mocks of the active story that nothing the story rendered ever read, named as the story
// named them. Only a fact once the story has rendered and settled (the point the story's error is
// read for the capture), never before.
export function unreachedMocksOfActiveStory(): string[] {
  return unreachedMockKeys();
}

export default activateStoryMocks;
