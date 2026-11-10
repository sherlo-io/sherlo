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
 *   2. PER PLATFORM, ONE AFTER THE OTHER (unless `build.parallel` or `--parallel-builds` asks for both at once - two compilers at once fight
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
import { reporting } from '../../../helpers';
import type { BaseFingerprints } from '../../../helpers/fingerprint';
import { podsLinkSherloInto } from '../../../helpers/installedPods';
import { dependsOnExpo } from '../../../helpers/projectJson';
import { emit } from '../../../helpers/transcriptSink';
import {
  type AppBuildCommand,
  renderAndroidFlavorsNeedATask,
  type WhyANewAppBuild,
} from '../../../render/appBuild';
import type { PlatformRow } from '../../../render/runRows';
import type { SherloProject } from '../../../render/testSteps';
import { whileShowing } from '../../shared/terminal';
import { rowsAbove, printPlatformRowInALog } from '../platformRows';
import { appBuilder } from '../../../seams/appBuilder';
import { cacheKeyOf, keepUnderInstalledTreeKey } from './appBuildCacheKeys';
import { type BuildSettings, DEFAULT_ANDROID_TASK, buildLogPath } from './buildSettings';
import { localBuildCacheFolder, makeProjectSherloFolder } from './cacheFolder';
import { pickIosBuild, refuseToBuildHere } from './iosBuildPick';

/** The Java a React Native Gradle build needs at the least. */
const MINIMUM_JAVA = 17;

/** The exit code of a run whose app build failed - the wait contract's "build/system error". */
const EXIT_BUILD_FAILED = 2;

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
}): Promise<{
  appBuildPaths: Partial<Record<Platform, string>>;
  platformRows: PlatformRow[];
  /** Per platform, how its app build was got: compiled here, the project's own command, or the cache. */
  madeBy: Partial<Record<Platform, 'compiled' | 'command' | 'build-cache'>>;
  /** The configuration the iOS app was compiled with here; none for a cached or own-command build. */
  iosConfiguration?: string;
}> {
  const builder = appBuilder();

  await refuseWhatThisMachineCannotBuild({ projectRoot, toBuild, settings, project });

  const cacheDir = localBuildCacheFolder(cacheDirFlag);
  const appBuildPaths: Partial<Record<Platform, string>> = {};
  const platformRows = [...storedPlatformRows];
  const madeBy: Partial<Record<Platform, 'compiled' | 'command' | 'build-cache'>> = {};
  let iosConfiguration: string | undefined;

  async function buildOnePlatform({ platform, why }: PlatformToBuild): Promise<void> {
    // Each platform's row says why it needed a new app build, so the reason rides on it.
    const whyThisBuild = why ? { why } : {};
    const nativeFolderIsGenerated = needsGeneratedNativeFolder(projectRoot, platform);
    const platformSettings = settings[platform] ?? {};
    const ownCommand =
      platformSettings.command && platformSettings.output
        ? { command: platformSettings.command, output: platformSettings.output }
        : undefined;
    // An iOS folder that is there is picked before the cache is asked, for the configuration the
    // build would use: whether the installed pods link Sherlo into it decides the cache key. The
    // project's own command needs no pick of Sherlo's, and a generated folder has no pods yet.
    let iosPick =
      platform === 'ios' && !ownCommand && !nativeFolderIsGenerated
        ? await pickIosBuild(projectRoot, settings, project)
        : null;
    /** Whether the installed pods link Sherlo into the picked configuration; undefined when none is picked. */
    const podsLinkSherlo = () =>
      iosPick?.configuration && !nativeFolderIsGenerated
        ? podsLinkSherloInto(path.join(projectRoot, 'ios'), iosPick.configuration.name)
        : undefined;
    const cacheKeyOfThePods = () =>
      cacheKeyOf({
        baseFingerprint: fingerprints[platform].hash ?? '',
        platform,
        settings,
        linksSherlo: podsLinkSherlo(),
      });
    const cacheKey = cacheKeyOfThePods();

    // A cached build made while the pods lacked Sherlo has no native module: nothing is reused until
    // the pods link it, and the build that follows is kept under the key of the linked pods.
    const cached =
      podsLinkSherlo() === false
        ? null
        : await builder.findCachedBuild({ platform, cacheKey, cacheDir });
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
      madeBy[platform] = 'build-cache';
      return;
    }

    // What the seam composes the build's environment from (its `buildEnvironment`), the same for
    // Sherlo's build and for the project's own command.
    const env = settings.env ?? {};
    const easProfile = settings.easProfile ? { easProfile: settings.easProfile } : {};

    // Each long step shows while it runs: a spinner in a terminal, one plain line in a log
    // (../../shared/terminal). The spinner is stopped before the step's own line prints.
    if (nativeFolderIsGenerated) {
      await whileShowing({ kind: 'app-build-generating', platform }, () =>
        builder.generateNativeFolder({ platform, projectRoot, env, ...easProfile })
      );
    }

    const logPath = buildLogPath(platform);
    // Picked before the compile is shown: a workspace with several schemes, or an app without the
    // configuration named, is refused, not compiled. A generated folder is picked once it is there.
    iosPick ??=
      platform === 'ios' && !ownCommand ? await pickIosBuild(projectRoot, settings, project) : null;

    // The build log is the first thing written into the project's `.sherlo/` folder.
    makeProjectSherloFolder(projectRoot);

    if (iosPick?.configuration) {
      emit({
        kind: 'app-build-picked-ios',
        scheme: iosPick.scheme,
        passedOverSchemes: iosPick.passedOverSchemes,
        configuration: iosPick.configuration.name,
        configurationFrom: iosPick.configuration.from,
      });
    }

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
        ...(iosPick
          ? {
              ios: {
                scheme: iosPick.scheme,
                configuration: iosPick.configuration?.name ?? platformSettings.configuration,
              },
            }
          : {}),
        ...(ownCommand ? { custom: ownCommand } : {}),
      })
    );

    if (!compiled.ok) {
      // `sherlo test` stops on the platforms' rows, the failed one among them, and tests nothing;
      // `sherlo build` on its own failed step.
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

    // Under the key of the pods the build left: pod install linked Sherlo into the configuration.
    const keptKey = cacheKeyOfThePods();
    await builder.keepInCache({ platform, cacheKey: keptKey, cacheDir, path: compiled.path });
    // Also under the key of the tree pod install left, for the next run on it.
    if (compiled.podInstallChangedFiles && !nativeFolderIsGenerated) {
      await keepUnderInstalledTreeKey({
        platform,
        settings,
        projectRoot,
        command,
        cacheDir,
        appPath: compiled.path,
        firstKey: keptKey,
        linksSherlo: podsLinkSherlo(),
      });
    }

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
          // A folder `expo prebuild` generated is deleted after the build: there is nothing to commit.
          ...(compiled.podFilesChanged.length > 0 && !nativeFolderIsGenerated
            ? { podFilesChanged: compiled.podFilesChanged }
            : {}),
          ...(compiled.podInstallSkipped ? { podInstallSkipped: true as const } : {}),
        })
      );
    } else {
      emit({ kind: 'app-build-done', platform, seconds: compiled.seconds, logPath });
    }

    appBuildPaths[platform] = compiled.path;
    madeBy[platform] = ownCommand ? 'command' : 'compiled';
    if (iosPick?.configuration) iosConfiguration = iosPick.configuration.name;
  }

  if (settings.parallel || parallelBuildsFlag) {
    await Promise.all(toBuild.map(buildOnePlatform));
  } else {
    for (const platformToBuild of toBuild) {
      await buildOnePlatform(platformToBuild);
    }
  }

  return { appBuildPaths, platformRows, madeBy, iosConfiguration };
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

      if (!(await builder.hasTool('xcode', projectRoot))) {
        refuse(
          "Can't build iOS: Xcode was not found.\n" +
            'Install Xcode, then run `sudo xcode-select -s /Applications/Xcode.app`.'
        );
      }

      // An Expo app's ios folder is made by `expo prebuild`, just before the build, so its one
      // scheme is asked for then, when there is a folder to list.
      if (!needsGeneratedNativeFolder(projectRoot, 'ios')) {
        await pickIosBuild(projectRoot, settings, project);
      }
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

      if (!(await builder.hasTool('android-sdk', projectRoot))) {
        refuse(
          "Can't build Android: no Android SDK was found.\n" +
            'Set ANDROID_HOME, or add sdk.dir to android/local.properties.'
        );
      }

      await refuseFlavorsWithoutATask(projectRoot, settings, project);
    }
  }
}

/** An app with product flavors and no build.android.task is refused before Gradle, with the task line to copy per flavor. */
async function refuseFlavorsWithoutATask(
  projectRoot: string,
  settings: BuildSettings,
  project: SherloProject | undefined
): Promise<void> {
  if (settings.android?.task) return;
  const tasks = await appBuilder().listAndroidFlavorTasks(projectRoot);
  if (tasks.length > 1) {
    refuseToBuildHere(renderAndroidFlavorsNeedATask({ tasks }), project);
  }
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
