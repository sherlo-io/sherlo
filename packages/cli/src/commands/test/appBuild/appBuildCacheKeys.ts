/**
 * THE KEYS THE LOCAL BUILD CACHE FILES AN APP BUILD UNDER (./buildApps keeps and finds builds by
 * them): the key of a base fingerprint, and the second key of a build whose `pod install` rewrote a
 * file the fingerprint reads. Tested in ./__tests__/buildApps.
 */
import type { Platform } from '@sherlo/api-types';
import { reporting } from '../../../helpers';
import type { AppBuildCommand } from '../../../render/appBuild';
import { appBuilder } from '../../../seams/appBuilder';
import { nativeBuild } from '../../../seams/nativeBuild';
import { type BuildSettings, buildSettingsDigest } from './buildSettings';

/** How many hex characters of the build settings digest a cache key carries. */
const SETTINGS_DIGEST_IN_KEY = 12;

/**
 * The key the local build cache files an app build under, and the name of its folder there: what
 * makes two builds the same build - `<platform>-<base fingerprint>-<12 hex of the settings digest>`.
 * The base fingerprint names the native code, and the build settings are hashed beside it
 * (./buildSettings `buildSettingsDigest`) because the fingerprint never sees them - a changed
 * `build.env` must not reuse an app built without it. An iOS build whose pods link Sherlo into its
 * configuration (`linksSherlo`) is kept under a key ending `-sherlo`: the fingerprint never sees
 * which configurations the pods were installed for, and a build under the plain key may lack
 * Sherlo's native module.
 */
export function cacheKeyOf({
  baseFingerprint,
  platform,
  settings,
  linksSherlo,
}: {
  baseFingerprint: string;
  platform: Platform;
  settings: BuildSettings;
  linksSherlo?: boolean;
}): string {
  const settingsDigest = buildSettingsDigest(settings, platform).slice(0, SETTINGS_DIGEST_IN_KEY);
  return `${platform}-${baseFingerprint}-${settingsDigest}${linksSherlo ? '-sherlo' : ''}`;
}

/**
 * Computes the platform's base fingerprint again over the tree as `pod install` left it, with the
 * function and options that computed the run's, and keeps the app under its key when that key is
 * not `firstKey`: the next run on that tree computes this fingerprint, and hits the cache. A
 * failure leaves the build and the first cache entry standing: it is reported, and the run goes on.
 */
export async function keepUnderInstalledTreeKey({
  platform,
  settings,
  projectRoot,
  command,
  cacheDir,
  appPath,
  firstKey,
  linksSherlo,
}: {
  platform: Platform;
  settings: BuildSettings;
  projectRoot: string;
  command: AppBuildCommand;
  cacheDir: string;
  appPath: string;
  /** The key the app is already kept under. */
  firstKey: string;
  /** Whether the pods the build left link Sherlo into its configuration (see `cacheKeyOf`). */
  linksSherlo?: boolean;
}): Promise<void> {
  try {
    const fingerprints = await nativeBuild().computeFingerprint(projectRoot, command);
    const baseFingerprint = fingerprints[platform].hash;
    if (!baseFingerprint) return;
    const cacheKey = cacheKeyOf({ baseFingerprint, platform, settings, linksSherlo });
    if (cacheKey !== firstKey) {
      await appBuilder().keepInCache({ platform, cacheKey, cacheDir, path: appPath });
    }
  } catch (error) {
    reporting.captureException(error);
  }
}
