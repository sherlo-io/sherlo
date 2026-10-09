/**
 * BUILD THE PLATFORMS THAT NEED A NEW APP BUILD - the step `sherlo test` takes where it used to stop
 * with `native-needed=true`, and the whole of `sherlo build`.
 *
 * In this order, and every refusal before anything is built:
 *
 *   1. CHECK THE MACHINE for every platform it will build: iOS needs macOS and Xcode, Android needs
 *      Java 17 or newer and an Android SDK, and an iOS workspace with more than one scheme needs the
 *      config to name one. A run that cannot finish stops here, having spent nothing.
 *   2. PER PLATFORM, ONE AFTER THE OTHER (operator ruling 2026-10-07: sequential unless the config
 *      says `parallel` - two compilers at once fight for the same cores and memory):
 *        - the local build cache, keyed by the base fingerprint, the platform and the build
 *          settings - a hit compiles nothing;
 *        - `expo prebuild` for an Expo app whose native folder is not there, taken away again after;
 *        - the compile, with everything the build tool says written to `.sherlo/build-<p>.log`;
 *        - a failure prints the log's last lines and ends the run with exit 2, nothing uploaded.
 *
 * What a build is made of - the Gradle init script that forces debug signing and switches
 * expo-updates off, the xcodebuild call, the cache - is the app builder seam's
 * (../../../seams/appBuilder). This module decides which of those happen and says so on screen.
 */
import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import type { Platform } from '@sherlo/api-types';
import { reporting, throwError } from '../../../helpers';
import { emit } from '../../../helpers/transcriptSink';
import type { AppBuildReason } from '../../../render/appBuild';
import { appBuilder } from '../../../seams/appBuilder';
import {
  BUILD_CACHE_ENV_VAR,
  type BuildSettings,
  DEFAULT_ANDROID_TASK,
  DEFAULT_BUILD_CACHE,
  buildLogPath,
} from './buildSettings';

/** The Java a React Native Gradle build needs at the least. */
const MINIMUM_JAVA = 17;

/** The exit code of a run whose app build failed - the wait contract's "build/system error". */
const EXIT_BUILD_FAILED = 2;

/** A platform to build, and why. `sherlo build` builds without a reason to give. */
export type PlatformToBuild = { platform: Platform; reason?: AppBuildReason };

/**
 * Build every platform asked for and answer where each app build is. Never returns for a run that
 * cannot finish: a refusal throws, and a failed build exits.
 */
export async function buildApps({
  projectRoot,
  toBuild,
  settings,
  baseFingerprint,
  cacheDirFlag,
  savedToCache,
}: {
  projectRoot: string;
  toBuild: PlatformToBuild[];
  settings: BuildSettings;
  baseFingerprint: string;
  /** `--build-cache <dir>`, when the command line names one. */
  cacheDirFlag?: string;
  /** `sherlo build` keeps what it builds in the cache, and says so. */
  savedToCache: boolean;
}): Promise<Partial<Record<Platform, string>>> {
  const builder = appBuilder();

  await refuseWhatThisMachineCannotBuild({ projectRoot, toBuild, settings });

  const cacheDir = cacheDirFlag ?? process.env[BUILD_CACHE_ENV_VAR] ?? DEFAULT_BUILD_CACHE;
  const builtPaths: Partial<Record<Platform, string>> = {};

  for (const { platform, reason } of toBuild) {
    emit(reason ? { kind: 'app-build-needed', platform, reason } : { kind: 'app-build-start', platform });

    const cacheKey = cacheKeyOf({ baseFingerprint, platform, settings });

    const cached = await builder.findCachedBuild({ platform, cacheKey, cacheDir });
    if (cached) {
      emit({ kind: 'app-build-cached', platform });
      builtPaths[platform] = cached;
      continue;
    }

    if (needsGeneratedNativeFolder(projectRoot, platform)) {
      emit({ kind: 'app-build-generating', platform });
      await builder.generateNativeFolder({ platform, projectRoot, env: settings.env ?? {} });
    }

    const logPath = buildLogPath(platform);
    emit({ kind: 'app-build-compiling', platform, logPath });

    const platformSettings = settings[platform] ?? {};
    const compiled = await builder.compile({
      platform,
      projectRoot,
      env: settings.env ?? {},
      logPath,
      ...(platform === 'android' ? { androidTask: platformSettings.task ?? DEFAULT_ANDROID_TASK } : {}),
      ...(platform === 'ios'
        ? {
            ios: {
              scheme: await iosSchemeOf(projectRoot, settings),
              configuration: platformSettings.configuration ?? 'Release',
            },
          }
        : {}),
      ...(platformSettings.command && platformSettings.output
        ? { custom: { command: platformSettings.command, output: platformSettings.output } }
        : {}),
    });

    if (!compiled.ok) {
      emit({
        kind: 'app-build-failed',
        platform,
        seconds: compiled.seconds,
        lastLines: compiled.lastLines,
        logPath,
      });
      await reporting.flush().finally(() => process.exit(EXIT_BUILD_FAILED));
      throw new Error('unreachable'); // process.exit above never returns
    }

    await builder.keepInCache({ platform, cacheKey, cacheDir, path: compiled.path });

    emit({
      kind: 'app-build-done',
      platform,
      seconds: compiled.seconds,
      sizeMb: compiled.sizeMb,
      savedToCache,
    });

    builtPaths[platform] = compiled.path;
  }

  return builtPaths;
}

/* ========================================================================== */

/**
 * Every refusal a build could hit on this machine, asked before the first one starts: a run that
 * stops in its second build after ten minutes of the first is ten minutes nobody needed to spend.
 */
async function refuseWhatThisMachineCannotBuild({
  projectRoot,
  toBuild,
  settings,
}: {
  projectRoot: string;
  toBuild: PlatformToBuild[];
  settings: BuildSettings;
}): Promise<void> {
  const builder = appBuilder();

  for (const { platform } of toBuild) {
    // A project's own command builds the way the project knows; the machine is its business.
    if (settings[platform]?.command) continue;

    if (platform === 'ios') {
      if (builder.hostSystem() !== 'macos') {
        throwError({
          message:
            "Can't build iOS here: iOS builds need macOS, and this machine runs Linux.\n" +
            'Run `npx sherlo test --platform android` here and `npx sherlo test --platform ios` on a Mac.\n' +
            'Two jobs in the same CI run join into one test.',
        });
      }

      if (!(await builder.hasTool('xcode'))) {
        throwError({
          message:
            "Can't build iOS: Xcode was not found.\n" +
            'Install Xcode, then run `sudo xcode-select -s /Applications/Xcode.app`.',
        });
      }

      await iosSchemeOf(projectRoot, settings);
    }

    if (platform === 'android') {
      const java = await builder.javaVersion();
      if (java === null) {
        throwError({
          message:
            "Can't build Android: no Java was found.\n" +
            'Install JDK 17 or newer, or point JAVA_HOME at one.',
        });
      }
      if (java < MINIMUM_JAVA) {
        throwError({
          message:
            `Can't build Android: Java ${java} was found, and the build needs ${MINIMUM_JAVA} or newer.\n` +
            'Point JAVA_HOME at a newer JDK.',
        });
      }

      if (!(await builder.hasTool('android-sdk'))) {
        throwError({
          message:
            "Can't build Android: no Android SDK was found.\n" +
            'Set ANDROID_HOME, or add sdk.dir to android/local.properties.',
        });
      }
    }
  }
}

/** The scheme an iOS build uses: the config's, the workspace's only one, or a refusal naming them. */
async function iosSchemeOf(projectRoot: string, settings: BuildSettings): Promise<string> {
  const named = settings.ios?.scheme;
  if (named) return named;

  const schemes = await appBuilder().listIosSchemes(projectRoot);
  if (schemes.length === 1) return schemes[0];

  throwError({
    message:
      `Can't pick an iOS scheme: the workspace has ${namesInAList(schemes)}.\n` +
      `Name one in sherlo.config.json: "build": { "ios": { "scheme": "${schemes[0] ?? 'MyApp'}" } }`,
  });
}

/** `A and B`, `A, B and C`. */
function namesInAList(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Whether the platform's native folder has to be generated first: an Expo app keeps none in the
 * project (Continuous Native Generation), and `expo prebuild` writes it. A project that has the
 * folder builds it as it is - prebuild never runs over a folder somebody may have changed by hand.
 */
function needsGeneratedNativeFolder(projectRoot: string, platform: Platform): boolean {
  if (fs.existsSync(path.join(projectRoot, platform))) return false;

  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    return Boolean(packageJson.dependencies?.expo ?? packageJson.devDependencies?.expo);
  } catch {
    return false;
  }
}

/**
 * The key the local build cache files an app build under: what makes two builds the same build.
 * The base fingerprint names the native code, and the build settings are hashed beside it because
 * the fingerprint never sees them - a changed `build.env` must not reuse an app built without it.
 */
function cacheKeyOf({
  baseFingerprint,
  platform,
  settings,
}: {
  baseFingerprint: string;
  platform: Platform;
  settings: BuildSettings;
}): string {
  const platformSettings = settings[platform] ?? {};
  const settingsThatShapeTheBuild = JSON.stringify({ env: settings.env ?? {}, ...platformSettings });
  return `${platform}-${baseFingerprint}-${shortDigest(settingsThatShapeTheBuild)}`;
}

/** A short stable digest of a string, for a cache key. */
function shortDigest(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}
