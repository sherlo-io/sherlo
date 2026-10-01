/**
 * THE HOST THE SDK HANDED THIS CORE: everything the core reaches, since it imports nothing.
 *
 * The SDK calls the core's `install` once, with the host, before it calls anything else - so a
 * module that reads the host reads it when it runs, never when it is loaded.
 */
import type { SealedCoreHost } from '../../../react-native-storybook/src/sealedCore/seam';

let installedHost: SealedCoreHost | undefined;

/** The core's `install`: keep the host for every module that reaches out through it. */
export function installHost(host: SealedCoreHost): void {
  installedHost = host;
}

/** The host the SDK installed. Asking before the install is a bug in the SDK, so it throws. */
export function theHost(): SealedCoreHost {
  if (!installedHost) throw new Error("Sherlo's core was called before the SDK installed it.");
  return installedHost;
}
