/**
 * THE PHONE SIDE - the small per-platform file Sherlo's service needs to draw an app's stories.
 *
 * Only the CLI can make it: it names the app's identity and carries the SDK's core file as it is.
 * It is raw input and nothing more - no verdict, no draw code, no native library list, no app
 * source and no secret. The service reads `version` first and refuses a shape it does not know
 * (it then answers cannot-vouch).
 */
import type { Platform } from '@sherlo/api-types';

export const PHONE_SIDE_VERSION = 1;

export type PhoneSide = {
  version: typeof PHONE_SIDE_VERSION;
  platform: Platform;
  /** The app identity of the platform: `bundleIdentifier` on iOS, `packageName` on Android. */
  app: { bundleIdentifier?: string; packageName?: string };
  /** The SDK's sherlo-core.js, whole. */
  core: { fileName: 'sherlo-core.js'; source: string };
};

export function buildPhoneSide({
  platform,
  appIdentity,
  coreSource,
}: {
  platform: Platform;
  appIdentity: string;
  coreSource: string;
}): PhoneSide {
  return {
    version: PHONE_SIDE_VERSION,
    platform,
    app: platform === 'ios' ? { bundleIdentifier: appIdentity } : { packageName: appIdentity },
    core: { fileName: 'sherlo-core.js', source: coreSource },
  };
}
