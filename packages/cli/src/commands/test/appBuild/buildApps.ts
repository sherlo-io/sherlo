/**
 * BUILD THE PLATFORMS THAT NEED A NEW APP BUILD - the step `sherlo test` takes where it used to stop
 * with `native-needed=true`, and the whole of `sherlo build`.
 *
 * In this order, and every refusal before anything is built:
 *
 *   1. CHECK THE MACHINE for every platform it will build: iOS needs macOS and Xcode, Android needs
 *      Java 17 or newer and an Android SDK, and an iOS workspace with more than one scheme needs the
 *      config to name one. A run that cannot finish stops here, having spent nothing. A platform
 *      built by the project's own command is not checked: the machine is that command's business.
 *   2. PER PLATFORM, ONE AFTER THE OTHER (operator ruling 2026-10-07: sequential unless
 *      `build.parallel` or `--parallel-builds` asks for both at once - two compilers at once fight
 *      for the same cores and memory):
 *        - the local build cache (./cacheFolder), keyed by the platform, the base fingerprint and
 *          the build settings - a hit compiles nothing;
 *        - `expo prebuild` for an Expo app whose native folder is not there, taken away again after;
 *        - the compile, with everything the build tool says written to `.sherlo/build-<p>.log`;
 *        - a failure prints the log's last lines and ends the run with exit 2, nothing uploaded.
 *
 * What a build is made of - the Gradle init script that forces debug signing and switches
 * expo-updates off, the xcodebuild call, the cache, the environment a build runs with - is the app
 * builder seam's (../../../seams/appBuilder). This module decides which of those happen and says so
 * on screen: `sherlo build` in lines of its own, `sherlo test` in each platform's row
 * (../platformRows).
 */
import path from 'path';
import fs from 'fs';
import type { Platform } from '@sherlo/api-types';
import { reporting, throwError } from '../../../helpers';
import type { BaseFingerprints } from '../../../helpers/fingerprint';
import { dependsOnExpo } from '../../../helpers/projectJson';
import { emit } from '../../../helpers/transcriptSink';
import {
  type AppBuildCommand,
  renderRunOnCi,
  type WhyANewAppBuild,
} from '../../../render/appBuild';
import type { PlatformRow } from '../../../render/runRows';
import type { SherloProject } from '../../../render/testSteps';
import { whileShowing } from '../../shared/terminal';
import { rowsAbove, printPlatformRowInALog } from '../platformRows';
import { appBuilder } from '../../../seams/appBuilder';
import {
  type BuildSettings,
  DEFAULT_ANDROID_TASK,
  buildLogPath,
  buildSettingsDigest,
} from './buildSettings';
import { localBuildCacheFolder, makeProjectSherloFolder } from './cacheFolder';

/** The Java a React Native Gradle build needs at the least. */
const MINIMUM_JAVA = 17;

/** The exit code of a run whose app build failed - the wait contract's "build/system error". */
const EXIT_BUILD_FAILED = 2;

/** How many hex characters of the build settings digest a cache key carries. */
const SETTINGS_DIGEST_IN_KEY = 12;

/**
 * A platform to build, and why - with what changed since the stored app build when the gate
 * handed back its source list. `sherlo build` builds without a reason to give.
 */
export type PlatformToBuild = {
  platform: Platform;
  why?: WhyANewAppBuild;
};

/**
 * Build every platform asked for and answer where each app build is, with the platforms' rows
 * `sherlo test` prints above its test's row. Never returns for a run that cannot finish: a refusal
 * throws, and a failed build exits.
 */
export async function buildApps({
  projectRoot,
  toBuild,
  settings,
  fingerprints,
  cacheDirFlag,
  parallelBuildsFlag,
  command,
  project,
  storedPlatformRows,
}: {
  projectRoot: string;
  toBuild: PlatformToBuild[];
  settings: BuildSettings;
  /** Each platform's base fingerprint: its app build is kept in the cache under its own. */
  fingerprints: BaseFingerprints;
  /** `--build-cache <dir>`, when the command line names one. */
  cacheDirFlag?: string;
  /** `--parallel-builds`: build every platform at once, as `build.parallel` does. */
  parallelBuildsFlag?: boolean;
  /** Which command builds: `sherlo build` only keeps the app build in the cache, and says so. */
  command: AppBuildCommand;
  /**
   * The project the run pushes to, when it knows one (`sherlo test`; `sherlo build` reads no
   * credential): a failure to build here points to building on CI, linking its page.
   */
  project?: SherloProject;
  /**
   * The rows of the platforms that keep the app build Sherlo stores - a mixed run's - which the
   * built ones' rows join. A failed build stops on every platform's row, so they are shown with
   * it. None for `sherlo build`, and for a run that builds every platform.
   */
  storedPlatformRows: PlatformRow[];
}): Promise<{ appBuildPaths: Partial<Record<Platform, string>>; platformRows: PlatformRow[] }> {
  const builder = appBuilder();

  await refuseWhatThisMachineCannotBuild({ projectRoot, toBuild, settings, project });

  const cacheDir = localBuildCacheFolder(cacheDirFlag);
  const appBuildPaths: Partial<Record<Platform, string>> = {};
  const platformRows = [...storedPlatformRows];

  async function buildOnePlatform({ platform, why }: PlatformToBuild): Promise<void> {
    // Each platform's row says why it needed a new app build, so the reason rides on it.
    const whyThisBuild = why ? { why } : {};
    const cacheKey = cacheKeyOf({
      baseFingerprint: fingerprints[platform].hash ?? '',
      platform,
      settings,
    });

    const cached = await builder.findCachedBuild({ platform, cacheKey, cacheDir });
    if (cached) {
      // `sherlo build` says it found what it was asked to build; `sherlo test` says it in the
      // platform's row.
      if (command === 'build') {
        emit({ kind: 'app-build-cached', platform });
      } else {
        platformRows.push(
          printPlatformRowInALog({ platform, appBuild: 'reused-from-local-build-cache' })
        );
      }
      appBuildPaths[platform] = cached;
      return;
    }

    // What the seam composes the build's environment from (its `buildEnvironment`), the same for
    // Sherlo's build and for the project's own command.
    const env = settings.env ?? {};
    const easProfile = settings.easProfile ? { easProfile: settings.easProfile } : {};

    // Each long step shows while it runs: a spinner in a terminal, one plain line in a log
    // (../../shared/terminal). The spinner is stopped before the step's own line prints.
    if (needsGeneratedNativeFolder(projectRoot, platform)) {
      await whileShowing({ kind: 'app-build-generating', platform }, () =>
        builder.generateNativeFolder({ platform, projectRoot, env, ...easProfile })
      );
    }

    const logPath = buildLogPath(platform);
    const platformSettings = settings[platform] ?? {};
    const ownCommand =
      platformSettings.command && platformSettings.output
        ? { command: platformSettings.command, output: platformSettings.output }
        : undefined;
    // Asked before the compile is shown: a workspace with several schemes is refused, not
    // compiled. The project's own command needs no scheme of Sherlo's.
    const iosScheme =
      platform === 'ios' && !ownCommand
        ? await iosSchemeOf(projectRoot, settings, project)
        : undefined;

    // The build log is the first thing written into the project's `.sherlo/` folder.
    makeProjectSherloFolder(projectRoot);

    const compiled = await whileShowing({ kind: 'app-build-compiling', platform }, () =>
      builder.compile({
        platform,
        projectRoot,
        env,
        ...easProfile,
        logPath,
        ...(platform === 'android'
          ? { androidTask: platformSettings.task ?? DEFAULT_ANDROID_TASK }
          : {}),
        ...(iosScheme !== undefined
          ? {
              ios: {
                scheme: iosScheme,
                configuration: platformSettings.configuration ?? 'Release',
              },
            }
          : {}),
        ...(ownCommand ? { custom: ownCommand } : {}),
      })
    );

    if (!compiled.ok) {
      // `sherlo test` stops on the platforms' rows, the failed one among them, and tests nothing
      // (operator, Q5); `sherlo build` on its own failed step.
      if (command === 'test') {
        const failedRow = printPlatformRowInALog({
          platform,
          appBuild: 'build-failed',
          seconds: compiled.seconds,
          logPath,
          ...whyThisBuild,
        });
        emit({
          kind: 'test-stopped-on-failed-build',
          rowsAbove: rowsAbove([...platformRows, failedRow]),
          lastLines: compiled.lastLines,
          ...(project ? { project } : {}),
        });
      } else {
        emit({
          kind: 'app-build-failed',
          platform,
          seconds: compiled.seconds,
          lastLines: compiled.lastLines,
          logPath,
        });
      }
      await reporting.flush().finally(() => process.exit(EXIT_BUILD_FAILED));
      throw new Error('unreachable'); // process.exit above never returns
    }

    await builder.keepInCache({ platform, cacheKey, cacheDir, path: compiled.path });

    // `sherlo test` says it in the platform's row above the test's (../platformRows);
    // `sherlo build` ends here, so it says it now.
    if (command === 'test') {
      platformRows.push(
        printPlatformRowInALog({
          platform,
          appBuild: 'built',
          seconds: compiled.seconds,
          logPath,
          ...whyThisBuild,
        })
      );
    } else {
      emit({ kind: 'app-build-done', platform, seconds: compiled.seconds, logPath });
    }

    appBuildPaths[platform] = compiled.path;
  }

  if (settings.parallel || parallelBuildsFlag) {
    await Promise.all(toBuild.map(buildOnePlatform));
  } else {
    for (const platformToBuild of toBuild) {
      await buildOnePlatform(platformToBuild);
    }
  }

  return { appBuildPaths, platformRows };
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
  project,
}: {
  projectRoot: string;
  toBuild: PlatformToBuild[];
  settings: BuildSettings;
  project?: SherloProject;
}): Promise<void> {
  const builder = appBuilder();
  const refuse = (message: string): never => refuseToBuildHere(message, project);

  for (const { platform } of toBuild) {
    // A project's own command builds the way the project knows; the machine is its business.
    if (settings[platform]?.command) continue;

    if (platform === 'ios') {
      if (builder.hostSystem() !== 'macos') {
        refuse(
          "Can't build iOS here: iOS builds need macOS, and this machine runs Linux.\n" +
            'Run `npx sherlo test --platform android` here and `npx sherlo test --platform ios` on a Mac.\n' +
            'Both jobs in the same CI run join into one Test.'
        );
      }

      if (!(await builder.hasTool('xcode'))) {
        refuse(
          "Can't build iOS: Xcode was not found.\n" +
            'Install Xcode, then run `sudo xcode-select -s /Applications/Xcode.app`.'
        );
      }

      await iosSchemeOf(projectRoot, settings, project);
    }

    if (platform === 'android') {
      const java = await builder.javaVersion();
      if (java === null) {
        return refuse(
          "Can't build Android: no Java was found.\n" +
            'Install JDK 17 or newer, or point JAVA_HOME at one.'
        );
      }
      if (java < MINIMUM_JAVA) {
        refuse(
          `Can't build Android: Java ${java} was found, and the build needs ${MINIMUM_JAVA} or newer.\n` +
            'Point JAVA_HOME at a newer JDK.'
        );
      }

      if (!(await builder.hasTool('android-sdk'))) {
        refuse(
          "Can't build Android: no Android SDK was found.\n" +
            'Set ANDROID_HOME, or add sdk.dir to android/local.properties.'
        );
      }
    }
  }
}

/**
 * Refuse to build on this machine: the refusal's own words, and under them the line that points to
 * building on CI instead (../../../render/appBuild `renderRunOnCi`), as every failure to build here
 * ends.
 */
function refuseToBuildHere(message: string, project: SherloProject | undefined): never {
  return throwError({ message, below: renderRunOnCi(project) });
}

/** The scheme an iOS build uses: the config's, the workspace's only one, or a refusal naming them. */
async function iosSchemeOf(
  projectRoot: string,
  settings: BuildSettings,
  project: SherloProject | undefined
): Promise<string> {
  const named = settings.ios?.scheme;
  if (named) return named;

  const schemes = await appBuilder().listIosSchemes(projectRoot);
  if (schemes.length === 1) return schemes[0];

  return refuseToBuildHere(
    `Can't pick an iOS scheme: the workspace has ${namesInAList(schemes)}.\n` +
      `Name one in sherlo.config.json: "build": { "ios": { "scheme": "${
        schemes[0] ?? 'MyApp'
      }" } }`,
    project
  );
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

  return dependsOnExpo(projectRoot);
}

/**
 * The key the local build cache files an app build under, and the name of its folder there: what
 * makes two builds the same build - `<platform>-<base fingerprint>-<12 hex of the settings digest>`.
 * The base fingerprint names the native code, and the build settings are hashed beside it
 * (./buildSettings `buildSettingsDigest`) because the fingerprint never sees them - a changed
 * `build.env` must not reuse an app built without it.
 */
export function cacheKeyOf({
  baseFingerprint,
  platform,
  settings,
}: {
  baseFingerprint: string;
  platform: Platform;
  settings: BuildSettings;
}): string {
  const settingsDigest = buildSettingsDigest(settings, platform).slice(0, SETTINGS_DIGEST_IN_KEY);
  return `${platform}-${baseFingerprint}-${settingsDigest}`;
}
