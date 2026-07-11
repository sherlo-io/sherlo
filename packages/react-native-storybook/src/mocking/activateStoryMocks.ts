import { activateMocks, isKeyShimmed } from './registry';
import { MockSet } from './types';
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
    `[Sherlo] Mock declared for ${
      plural ? 'modules' : 'module'
    } ${keyList} but no shim was generated - ` +
    `${plural ? 'these mocks' : 'this mock'} will not apply. Fix by either: ` +
    '(1) restarting Metro so the mock scan picks up the new key, or ' +
    `(2) adding ${plural ? 'them' : 'it'} to the "mockModules" option in your Sherlo Metro config.`;

  console.warn(message);
  RunnerBridge.log(UNSHIMMED_KEYS_LOG, { keys: unshimmedKeys });
}

// Installs `mocks` as the active set for one story (replacing whatever was active
// before) and flags any declared key that has no generated shim.
export function activateStoryMocks(mocks: MockSet): void {
  activateMocks(mocks);
  warnUnshimmedKeys(mocks);
}

export default activateStoryMocks;
