import { activateMocks, isKeyShimmed } from './registry';
import { MockSet } from './types';

// FG-03: a key declared in `sherlo.mocks` with no generated shim can never take effect -
// the module import was never redirected, so createMockable never ran for it (typically
// a static-scan miss, or a key added after the last Metro start). Warn loudly, once per
// activation, naming the key and both fixes - callers must call this only once shims have
// had the chance to load (see enumerateStories, which forces every shim to evaluate).
function warnUnshimmedKeys(mocks: MockSet): void {
  const unshimmedKeys = Object.keys(mocks).filter((key) => !isKeyShimmed(key));
  if (unshimmedKeys.length === 0) return;

  const keyList = unshimmedKeys.map((key) => `"${key}"`).join(', ');
  const plural = unshimmedKeys.length > 1;

  console.warn(
    `[Sherlo] Mock declared for ${
      plural ? 'modules' : 'module'
    } ${keyList} but no shim was generated - ` +
      `${plural ? 'these mocks' : 'this mock'} will not apply. Fix by either: ` +
      '(1) restarting Metro so the mock scan picks up the new key, or ' +
      `(2) adding ${
        plural ? 'them' : 'it'
      } to the "mockModules" option in your Sherlo Metro config.`
  );
}

// Installs `mocks` as the active set for one story (replacing whatever was active
// before) and flags any declared key that has no generated shim.
export function activateStoryMocks(mocks: MockSet): void {
  activateMocks(mocks);
  warnUnshimmedKeys(mocks);
}

export default activateStoryMocks;
