import { activateMocks, isKeyShimmed } from './registry';
import { MockSet } from './types';

// Stable log key the runner (and the FG-03 device test) tails from log.sherlo.
export const UNSHIMMED_KEYS_LOG = 'mock declared but unshimmed';

interface AttachedRuntime {
  log?: (key: string, parameters?: Record<string, unknown>) => void;
}

function getAttachedRuntime(): AttachedRuntime | null | undefined {
  return (globalThis as unknown as { __SHERLO_HOST__?: { runtime?: AttachedRuntime | null } })
    .__SHERLO_HOST__?.runtime;
}

// FG-03: a key declared in `sherlo.mocks` with no generated shim can never take effect -
// the module import was never redirected, so createMockable never ran for it (typically
// a static-scan miss, or a key added after the last Metro start). Warn loudly, once per
// activation, naming the key and both fixes - callers must call this only once shims have
// had the chance to load (see enumerateStories, which forces every shim to evaluate).
//
// The warning goes out on TWO channels: console.warn (visible in a dev session) AND
// a seam hop into whatever runtime is attached (log.sherlo, when one is). The second
// channel is what makes FG-03 observable during a capture run, where setupErrorSilencing
// nulls console.warn - the runner reads the log line even though the console message is
// swallowed. On the developer path (nothing attached) only the console channel fires.
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
    } composed at runtime, list ${plural ? 'them' : 'it'} under mockModules in your Sherlo config.`;

  console.warn(message);
  try {
    getAttachedRuntime()?.log?.(UNSHIMMED_KEYS_LOG, { keys: unshimmedKeys });
  } catch (_) {
    /* no runtime attached, or it declined the call - the console warning already fired */
  }
}

// Installs `mocks` as the active set for one story (replacing whatever was active
// before) and flags any declared key that has no generated shim.
export function activateStoryMocks(mocks: MockSet): void {
  activateMocks(mocks);
  warnUnshimmedKeys(mocks);
}

export default activateStoryMocks;
