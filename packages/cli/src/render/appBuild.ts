/**
 * THE APP BUILD LINES - what `sherlo test` prints when it builds a platform's app itself, what
 * `sherlo build` prints, and the lines that say a run is waiting for builds still to come.
 *
 * Every word here was chosen by the content department (epic sherlo-test-builds-apps, review of
 * 2026-10-07): a status line attached to its step takes no full stop, an explanation of two or
 * more sentences keeps them, "stored app build" is the one Sherlo holds and "local build cache" is
 * the one on this machine - two words, so a reader never takes one for the other.
 *
 * Pure, like the rest of the layer: a duration arrives in seconds and is phrased here, never read
 * off a clock.
 */
import chalk from 'chalk';
import type { Platform } from '@sherlo/api-types';
import { renderBuildMessageLine } from './pushSpine';

/** Why a platform needs a new app build, as the staged gate decided it. */
export type AppBuildReason = 'nothing-stored' | 'native-changed';

/** What an open run is still waiting for. */
export type RunWaitsFor =
  /** The other job of a split CI run, building the named platform, in the named CI run. */
  | { otherJob: Platform; ciRunId: string }
  /** The EAS builds this run started. */
  | { easBuilds: true }
  /** The one EAS build still to come, seen from inside the EAS build that just delivered its platform. */
  | { easBuild: Platform };

const PLATFORM_NAME: Record<Platform, string> = { android: 'Android', ios: 'iOS' };

const BUILD_TOOL: Record<Platform, string> = { android: 'Gradle', ios: 'Xcode' };

/** `1m 28s`, or `42s` under a minute. */
export function formatBuildDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

/** `🔨 Android needs a new app build: none is stored for this project yet`. */
export function renderAppBuildNeeded(platform: Platform, reason: AppBuildReason): string {
  const why =
    reason === 'nothing-stored'
      ? 'none is stored for this project yet'
      : 'native code changed since the stored one';
  return `🔨 ${chalk.bold(PLATFORM_NAME[platform])} needs a new app build: ${why}`;
}

/** `✔  iOS: only JavaScript changed, so the stored app build is reused`. */
export function renderStoredBuildReused(platform: Platform): string {
  return renderBuildMessageLine(
    `${PLATFORM_NAME[platform]}: only JavaScript changed, so the stored app build is reused`,
    'success'
  );
}

/** `🔨 Building Android...`. */
export function renderAppBuildStart(platform: Platform): string {
  return `🔨 ${chalk.bold(`Building ${PLATFORM_NAME[platform]}...`)}`;
}

/** `✔  reused the Android app build from the local build cache`. */
export function renderAppBuildCached(platform: Platform): string {
  return renderBuildMessageLine(
    `reused the ${PLATFORM_NAME[platform]} app build from the local build cache`,
    'success'
  );
}

/** `➜  generating the android folder (expo prebuild)...`. */
export function renderAppBuildGenerating(platform: Platform): string {
  return renderBuildMessageLine(`generating the ${platform} folder (expo prebuild)...`, 'info');
}

/** `➜  building with Gradle... (log: .sherlo/build-android.log)`. */
export function renderAppBuildCompiling(platform: Platform, logPath: string): string {
  return renderBuildMessageLine(
    `building with ${BUILD_TOOL[platform]}... ${chalk.dim(`(log: ${logPath})`)}`,
    'info'
  );
}

/**
 * `✔  Android built in 1m 28s (53.90 MB)`, and for `sherlo build` the cache sentence: the build
 * line says where it went, and the line under it says when it stops being used.
 */
export function renderAppBuildDone({
  platform,
  seconds,
  sizeMb,
  savedToCache,
}: {
  platform: Platform;
  seconds: number;
  sizeMb: string;
  savedToCache: boolean;
}): string[] {
  const built = `${PLATFORM_NAME[platform]} built in ${formatBuildDuration(seconds)} (${sizeMb} MB)`;

  if (!savedToCache) return [renderBuildMessageLine(built, 'success')];

  return [
    renderBuildMessageLine(`${built} and saved to the local build cache`, 'success'),
    chalk.dim(
      '   `sherlo test` uses it instead of building, until native code or build settings change.'
    ),
  ];
}

/**
 * The failed build: the build tool's last lines, quoted, and where the whole log is. Two spaces
 * after `✗`, so it lines up with the `➜` lines of the step it ended.
 */
export function renderAppBuildFailed({
  platform,
  seconds,
  lastLines,
  logPath,
}: {
  platform: Platform;
  seconds: number;
  lastLines: string[];
  logPath: string;
}): string[] {
  return [
    `${chalk.red('✗')}  ${chalk.red(
      `${PLATFORM_NAME[platform]} build failed after ${formatBuildDuration(seconds)}.`
    )} Last lines of the log:`,
    '',
    ...lastLines.map((line) => chalk.dim(`   | ${line}`)),
    '',
    `   Full log: ${logPath}`,
    '   Nothing was uploaded and no test ran.',
  ];
}

/** `☁️  Building on EAS with profile "sherlo"...`. */
export function renderEasBuildHeader(profile: string): string {
  return `☁️  ${chalk.bold(`Building on EAS with profile "${profile}"...`)}`;
}

/** `✔  Android: EAS build queued`. */
export function renderEasBuildQueued(platform: Platform): string {
  return renderBuildMessageLine(`${PLATFORM_NAME[platform]}: EAS build queued`, 'success');
}

/** The profile reads variables kept on Expo's servers, which a build on this machine cannot read. */
export function renderEasHostedVariables(profile: string, environment: string): string[] {
  return [
    chalk.yellow(
      `⚠️  eas.json profile "${profile}" uses variables stored on Expo's servers (environment: ${environment}).`
    ),
    chalk.yellow("    A build on this machine can't read them."),
    chalk.yellow('    If the app needs them, set them in sherlo.config.json "build.env".'),
  ];
}

/** `⏸  Test 1 starts when the iOS build arrives from the other job (run 123)`. */
export function renderRunWaitsForBuilds(buildIndex: number, waitingFor: RunWaitsFor): string {
  const test = chalk.green(`Test ${buildIndex}`);
  const when =
    'easBuilds' in waitingFor
      ? 'the EAS builds finish and upload to Sherlo'
      : 'easBuild' in waitingFor
        ? `the ${PLATFORM_NAME[waitingFor.easBuild]} EAS build finishes and uploads to Sherlo`
        : `the ${PLATFORM_NAME[waitingFor.otherJob]} build arrives from the other job (run ${waitingFor.ciRunId})`;
  return `⏸  ${test} starts when ${when}`;
}

/** `▶  Both builds are in - Test 1 is starting`. */
export function renderRunStarting(buildIndex: number): string {
  return `▶  Both builds are in - ${chalk.green(`Test ${buildIndex}`)} is starting`;
}
