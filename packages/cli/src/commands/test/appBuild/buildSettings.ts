/**
 * THE `build` BLOCK OF sherlo.config.json, AND THE FLAGS THAT STEER A BUILD.
 *
 * `sherlo test` builds the platforms that need a new app build itself, and `sherlo build` builds
 * them into the local build cache without pushing. Neither needs any of this to work: the defaults
 * build a stock Expo or React Native app. Each key exists for a project shape that needs it:
 *
 *     tool                  "native" (Gradle and xcodebuild, the default) or "eas" (EAS cloud)
 *     parallel              build both platforms at once instead of one after the other
 *     env                   variables every build and the bundler see - e.g. the one that turns
 *                           Storybook on, or NEW_ARCH_ENABLED
 *     easProfile            the eas.json profile: its `env` is borrowed for a local build, and
 *                           an EAS build is started with it (default "sherlo")
 *     android.task          the Gradle task, for flavors and modules (default ":app:assembleRelease")
 *     ios.scheme            the scheme, when the workspace lists more than one
 *     ios.configuration     the configuration (default "Release")
 *     <platform>.command    a build command of the project's own, run instead of Sherlo's
 *     <platform>.output     where that command writes the app build
 */
import { createHash } from 'crypto';
import type { Platform } from '@sherlo/api-types';

/** The flags that steer a build, as commander hands them over. */
export type BuildFlags = {
  /** `--platform <android|ios>`: build and test this platform only - one job of a split CI run. */
  platform?: string;
  /** `--run-id <id>`: the CI run the two jobs of a split share, where no CI provider names one. */
  runId?: string;
  /** `--build-cache <dir>`: where the local build cache is kept (./cacheFolder). */
  buildCache?: string;
  /** `--parallel-builds`: build both platforms at once. */
  parallelBuilds?: boolean;
};

/** One platform's part of the `build` block. */
export type PlatformBuildSettings = {
  task?: string;
  scheme?: string;
  configuration?: string;
  command?: string;
  output?: string;
};

/** The `build` block, every key optional. */
export type BuildSettings = {
  tool?: 'native' | 'eas';
  parallel?: boolean;
  env?: Record<string, string>;
  easProfile?: string;
  android?: PlatformBuildSettings;
  ios?: PlatformBuildSettings;
};

/** `sherlo build`. */
export const BUILD_COMMAND = 'build';

/** The flags, by the key commander hands each one over under. */
export const PLATFORM_OPTION = 'platform';
export const RUN_ID_OPTION = 'runId';
export const BUILD_CACHE_OPTION = 'buildCache';
export const PARALLEL_BUILDS_OPTION = 'parallelBuilds';

/** The eas.json profile a project builds on EAS with when the config names none. */
export const DEFAULT_EAS_PROFILE = 'sherlo';

/** The Gradle task a stock app's release build is. `:app:` keeps library modules out of it. */
export const DEFAULT_ANDROID_TASK = ':app:assembleRelease';

/** Where one platform's build writes everything its build tool says. */
export function buildLogPath(platform: Platform): string {
  return `.sherlo/build-${platform}.log`;
}

/**
 * A digest of the build settings that shape one platform's app build: every key of the `build`
 * block but `tool` and `parallel`, which say how and when to build, not what - and of the
 * platform-keyed ones, only this platform's. Keys are sorted first, so the same settings written
 * in another order are the same build.
 */
export function buildSettingsDigest(settings: BuildSettings, platform: Platform): string {
  const settingsThatShapeTheBuild = {
    env: sortedByKey(settings.env ?? {}),
    easProfile: settings.easProfile ?? null,
    platform: sortedByKey(settings[platform] ?? {}),
  };
  return createHash('sha256').update(JSON.stringify(settingsThatShapeTheBuild)).digest('hex');
}

/** The digest of each of `platforms`, which the service files each registered base under. */
export function buildSettingsDigestsOf(
  settings: BuildSettings,
  platforms: Platform[]
): Partial<Record<Platform, string>> {
  return Object.fromEntries(
    platforms.map((platform) => [platform, buildSettingsDigest(settings, platform)])
  );
}

function sortedByKey<Value>(record: Record<string, Value>): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
}

/** The `build` block a command's params carry, read off the config file it came from. */
export function readBuildSettings(commandParams: object): BuildSettings {
  const settings = (commandParams as { buildSettings?: unknown }).buildSettings;
  return settings && typeof settings === 'object' ? (settings as BuildSettings) : {};
}
