import { activateMocks, isKeyShimmed, isMockingModeActive } from './registry';
import { MockSet } from './types';
import { CLOCK_MOCK_KEY, ClockDefinition, installClock, restoreClock } from './clock';
import { RANDOM_MOCK_KEY, RandomDefinition, installRandom, restoreRandom } from './random';
import RunnerBridge from '../helpers/RunnerBridge';

// Stable log key the runner (and the FG-03 device test) tails from log.sherlo.
export const UNSHIMMED_KEYS_LOG = 'mock declared but unshimmed';

// FG-03: a key declared in `sherlo.mocks` with no generated shim can never take effect -
// the module import was never redirected, so createMockable never ran for it (typically
// a static-scan miss, or a key added after the last Metro start). Warn loudly, once per
// activation, naming the key and both fixes - callers must call this only once shims have
// had the chance to load (see enumerateStories, which forces every shim to evaluate).
//
// The warning goes out on TWO channels: console.warn (visible in a dev session) AND
// RunnerBridge.log (written to log.sherlo). The second channel is what makes FG-03
// observable during a capture run, where setupErrorSilencing nulls console.warn - the
// runner reads the log line even though the console message is swallowed.
function warnUnshimmedKeys(mocks: MockSet): void {
  const unshimmedKeys = Object.keys(mocks).filter((key) => !isKeyShimmed(key));
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

  console.warn(message);
  RunnerBridge.log(UNSHIMMED_KEYS_LOG, { keys: unshimmedKeys });
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
  warnUnshimmedKeys(moduleMocks);
}

export default activateStoryMocks;
