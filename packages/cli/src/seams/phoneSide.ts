/**
 * THE PHONE SIDE - the small per-platform file Sherlo's service needs to draw an app's stories.
 *
 * Only the CLI can make it: it names the native modules the platform links, the app's identity
 * and carries the SDK's core file as it is. It is raw input and nothing more - no verdict, no
 * draw code, no app source and no secret. The service reads `version` first and refuses a shape
 * it does not know (it then answers cannot-vouch).
 *
 * The linked modules come from the autolinking read the base fingerprint already does
 * (`preimage.autolinkedModules`, sorted `name@version` entries); this file never reads the native
 * project a second time.
 */
import type { Platform } from '@sherlo/api-types';

export const PHONE_SIDE_VERSION = 1;

export type PhoneSide = {
  version: typeof PHONE_SIDE_VERSION;
  platform: Platform;
  /** The names of the linked native modules, sorted, each once. */
  linkedModules: string[];
  /** The app identity of the platform: `bundleIdentifier` on iOS, `packageName` on Android. */
  app: { bundleIdentifier?: string; packageName?: string };
  /** The SDK's sherlo-core.js, whole. */
  core: { fileName: 'sherlo-core.js'; source: string };
};

/** `name@version` gives `name`; a scoped `@scope/name@1.0.0` keeps its scope. */
function moduleName(entry: string): string {
  const at = entry.lastIndexOf('@');
  return at > 0 ? entry.slice(0, at) : entry;
}

export function buildPhoneSide({
  platform,
  autolinkedModules,
  appIdentity,
  coreSource,
}: {
  platform: Platform;
  /** `preimage.autolinkedModules` of the platform's base fingerprint. */
  autolinkedModules: string[];
  appIdentity: string;
  coreSource: string;
}): PhoneSide {
  return {
    version: PHONE_SIDE_VERSION,
    platform,
    linkedModules: [...new Set(autolinkedModules.map(moduleName))].sort(),
    app: platform === 'ios' ? { bundleIdentifier: appIdentity } : { packageName: appIdentity },
    core: { fileName: 'sherlo-core.js', source: coreSource },
  };
}
