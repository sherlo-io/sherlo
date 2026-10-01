/**
 * A HOST FOR THE CORE'S OWN TESTS, standing in for the one the SDK hands the core's install.
 *
 * It carries only what the core reads: the SDK's real mock merge (its open mocking code, the same
 * function the SDK hands over), a native module in default mode, no story on screen, and a warning
 * that goes nowhere. A test replaces any of them.
 */
import type { SealedCoreHost } from '../../../react-native-storybook/src/sealedCore/seam';
import { mergeStoryMocks } from '../../../react-native-storybook/src/mocking/mergeMocks';
import { installHost } from '../src/host';

export function installTestHost(replaced: Partial<SealedCoreHost> = {}): void {
  const host = {
    native: { getMode: () => 'default' },
    mergeStoryMocks,
    storyOfTheAppFiber: () => undefined,
    warn: () => {},
    ...replaced,
  };
  installHost(host as unknown as SealedCoreHost);
}
