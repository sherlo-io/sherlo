/**
 * THE APP BUILD LINES - what `sherlo test` prints when it builds a platform's app itself, what
 * `sherlo build` prints, and the lines that say a run is waiting for builds still to come.
 *
 * In init's grammar (./testSteps): one past-tense line per step. Every platform's app build ends in
 * ONE line, named the same whichever way the app build was come by - `Built the Android app` - so a
 * rerun reads as the same list, and the detail keeps the three sources apart:
 *
 *     in 4m 12s, ...                         built on this machine, in this run
 *     kept in the local build cache          built on this machine earlier, taken from its cache
 *     stored from Test 12, ...               the app build Sherlo holds, from an earlier test
 *
 * the last two dimmed `(reused)`. "Stored app build" is the one Sherlo holds and "local build cache"
 * is the one on this machine - two words, so a reader never takes one for the other (content
 * department, review of 2026-10-07).
 *
 * Pure, like the rest of the layer: a duration arrives in seconds and is phrased here, never read
 * off a clock. The words are drafts for the content department.
 */
import chalk from 'chalk';
import type { Platform } from '@sherlo/api-types';
import { PLATFORM_LABEL } from '../constants';
import { renderSectionTitle } from './initLines';
import {
  platformWithEmoji,
  renderFailedTestStep,
  renderHelpBlock,
  renderStepInProgress,
  renderTestStep,
} from './testSteps';

/** Why a platform needs a new app build, as the staged gate decided it. */
export type AppBuildReason = 'nothing-stored' | 'native-changed';

/** Which command built the app: a test goes on to upload it, `sherlo build` only keeps it. */
export type AppBuildCommand = 'test' | 'build';

/** What an open run is still waiting for. */
export type RunWaitsFor =
  /** The other job of a split CI run, building the named platform, in the named CI run. */
  | { otherJob: Platform; ciRunId: string }
  /** The EAS builds this run started. */
  | { easBuilds: true }
  /** The one EAS build still to come, seen from inside the EAS build that just delivered its platform. */
  | { easBuild: Platform };

const BUILD_TOOL: Record<Platform, string> = { android: 'Gradle', ios: 'Xcode' };

/** `1m 28s`, or `42s` under a minute. */
export function formatBuildDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

/**
 * One native change since the stored app build: a file (a native file, a lockfile, or a resolved
 * setting named by the file a developer edits), or a native module with its version.
 */
export type NativeChange =
  | { change: 'changed' | 'added' | 'removed'; file: string }
  | { change: 'added' | 'removed'; module: string; version: string }
  | { change: 'changed'; module: string; from: string; to: string };

/** What changed since the stored app build, and which test built it. */
export type ChangesSinceStoredBuild = { storedBuildIndex: number; changes: NativeChange[] };

/**
 * Why this run needed a new app build: what the gate said, the test the stored app build came
 * from when one is stored, and what changed when it can say.
 */
export type WhyANewAppBuild = {
  reason: AppBuildReason;
  storedBuildIndex?: number;
  changesSince?: ChangesSinceStoredBuild;
};

/** At most this many changes are listed; the rest are counted in one "and N more" line. */
export const NATIVE_CHANGES_LISTED = 8;

/** Coloured when printed, not when loaded: a run decides whether colour is on after the import. */
function changeMark(change: NativeChange['change']): string {
  if (change === 'added') return chalk.green('+');
  if (change === 'removed') return chalk.red('-');
  return chalk.yellow('~');
}

/**
 * The list of native changes, one per line: `~` changed, `+` added, `-` removed; a native module
 * as `name version`, or `name old → new` when its version moved. Capped at
 * {@link NATIVE_CHANGES_LISTED}, with the rest counted.
 */
export function renderNativeChanges(changes: NativeChange[]): string[] {
  const listed = changes.slice(0, NATIVE_CHANGES_LISTED);
  const lines = listed.map((change) => `   ${changeMark(change.change)} ${describeChange(change)}`);

  const notListed = changes.length - listed.length;
  if (notListed > 0) lines.push(chalk.dim(`   and ${notListed} more`));

  return lines;
}

function describeChange(change: NativeChange): string {
  if ('file' in change) return change.file;
  if ('from' in change) return `${change.module} ${change.from} → ${change.to}`;
  return `${change.module} ${change.version}`;
}

/**
 * Why the app was built again, as the step's detail says it: "no app build stored yet", or
 * "native code changed since Test 12's app build" (with the list under the step line, when the
 * gate could say what changed). `nothingStored` is how the line says the first: a line that
 * already named the local build cache says "none stored by Sherlo yet", so the two stores read
 * apart.
 */
function whyBuilt(
  { reason, storedBuildIndex, changesSince }: WhyANewAppBuild,
  nothingStored = 'no app build stored yet'
): string {
  if (reason === 'nothing-stored') return nothingStored;

  const storedIn = changesSince?.storedBuildIndex ?? storedBuildIndex;
  return storedIn !== undefined
    ? `native code changed since Test ${storedIn}'s app build`
    : 'native code changed since the stored app build';
}

/** The native changes under a step line, when the gate could say what they were. */
function changesUnder(why: WhyANewAppBuild | undefined): string[] {
  const changes = why?.changesSince?.changes ?? [];
  return changes.length > 0 ? renderNativeChanges(changes) : [];
}

function builtTheApp(platform: Platform): string {
  return `Built the ${PLATFORM_LABEL[platform]} app`;
}

/**
 * `✔ Built the iOS app          stored from Test 12, only JavaScript changed since (reused)`.
 * `storedBuildIndex` is absent only while the service does not send it; the line then says
 * "stored by Sherlo".
 */
export function renderStoredBuildReused(platform: Platform, storedBuildIndex?: number): string {
  const stored = storedBuildIndex !== undefined ? `stored from Test ${storedBuildIndex}` : 'stored by Sherlo';
  return renderTestStep({
    name: builtTheApp(platform),
    detail: `${stored}, only JavaScript changed since`,
    reused: true,
  });
}

/** `✔ Built the Android app      kept in the local build cache, none stored by Sherlo yet (reused)`. */
export function renderAppBuildCached({
  platform,
  why,
}: {
  platform: Platform;
  /** Absent for `sherlo build`, which builds without a reason to give. */
  why?: WhyANewAppBuild;
}): string[] {
  const detail = why
    ? `kept in the local build cache, ${whyBuilt(why, 'none stored by Sherlo yet')}`
    : 'kept in the local build cache';

  return [renderTestStep({ name: builtTheApp(platform), detail, reused: true }), ...changesUnder(why)];
}

/** `Generating the android folder with expo prebuild...` - only for an Expo app with no native folder. */
export function renderAppBuildGenerating(platform: Platform): string {
  return renderStepInProgress(`Generating the ${platform} folder with expo prebuild...`);
}

/** `Building the Android app with Gradle...` - printed before the compile runs. */
export function renderAppBuildCompiling(platform: Platform): string {
  return renderStepInProgress(
    `Building the ${PLATFORM_LABEL[platform]} app with ${BUILD_TOOL[platform]}...`
  );
}

/**
 * `✔ Built the Android app      in 1m 28s, no app build stored yet (log: .sherlo/build-android.log)`,
 * and the native changes under it. `sherlo build` says where it kept the app build instead of why
 * it built one.
 */
export function renderAppBuildDone({
  platform,
  seconds,
  logPath,
  why,
  command,
}: {
  platform: Platform;
  seconds: number;
  logPath: string;
  why?: WhyANewAppBuild;
  command: AppBuildCommand;
}): string[] {
  const after =
    command === 'build' ? 'kept in the local build cache' : why ? whyBuilt(why) : undefined;
  const detail = `in ${formatBuildDuration(seconds)}${after ? `, ${after}` : ''} ${chalk.dim(
    `(log: ${logPath})`
  )}`;

  return [renderTestStep({ name: builtTheApp(platform), detail }), ...changesUnder(why)];
}

/**
 * `sherlo build` ends on what the app build it kept is for: the next `sherlo test` takes it from the
 * local build cache instead of building.
 */
export function renderAppBuildNextStep(): string[] {
  return [
    // The underline is one longer than the title: the emoji is counted as one character and drawn as two.
    ...renderSectionTitle('👉 Next step', 12),
    chalk.bold('Test your app'),
    `   ${chalk.cyan('npx sherlo test')} takes this app build from the local build cache instead of building,`,
    '   until native code or build settings change.',
  ];
}

/**
 * The failed build, in init's failed-step shape: what changed since the stored app build (the
 * likely cause, so it sits right above the error), the build tool's last lines quoted, where the
 * whole log is, what to do - and the help block, because the run ends here.
 */
export function renderAppBuildFailed({
  platform,
  seconds,
  lastLines,
  logPath,
  why,
  command,
}: {
  platform: Platform;
  seconds: number;
  lastLines: string[];
  logPath: string;
  why?: WhyANewAppBuild;
  command: AppBuildCommand;
}): string[] {
  const changes = changesUnder(why);
  const changesBlock =
    changes.length > 0
      ? [`Native code changed since Test ${why!.changesSince!.storedBuildIndex}'s app build:`, ...changes, '']
      : [];
  const whatNow =
    command === 'test'
      ? `Nothing was uploaded and no test was started. Fix the build, then run ${chalk.cyan('npx sherlo test')} again.`
      : `Fix the build, then run ${chalk.cyan('npx sherlo build')} again.`;

  return [
    ...renderFailedTestStep(`Building the ${PLATFORM_LABEL[platform]} app`),
    ...changesBlock,
    `The build failed after ${formatBuildDuration(seconds)}. Last lines of the log:`,
    ...lastLines.map((line) => chalk.dim(`   | ${line}`)),
    '',
    `Full log: ${logPath}`,
    whatNow,
    '',
    ...renderHelpBlock(),
  ];
}

/** `✔ Started an EAS build       🤖 Android, profile "sherlo"`. */
export function renderEasBuildStarted(platform: Platform, profile: string): string {
  return renderTestStep({
    name: 'Started an EAS build',
    detail: `${platformWithEmoji(platform)}, profile "${profile}"`,
  });
}

/** The profile reads variables kept on Expo's servers, which a build on this machine cannot read. */
export function renderEasHostedVariables(profile: string, environment: string): string[] {
  return [
    chalk.yellow(
      `! eas.json profile "${profile}" uses variables stored on Expo's servers (environment: ${environment}).`
    ),
    chalk.yellow("  A build on this machine can't read them."),
    chalk.yellow('  If the app needs them, set them in sherlo.config.json "build.env".'),
  ];
}

/**
 * The run is open and waits for app builds still to come:
 *
 *     ✔ Opened Test 1              it starts when 🍎 iOS arrives from the other job (CI run 123)
 *     ✔ Opened Test 1              it starts when the EAS builds are uploaded
 *     ✔ Added to Test 1            it starts when the 🍎 iOS EAS build is uploaded
 *
 * The last is the EAS build that delivered its own platform first: the run was opened by
 * `sherlo test`, and this build only joined it.
 */
export function renderRunWaitsForBuilds(buildIndex: number, waitingFor: RunWaitsFor): string {
  if ('easBuild' in waitingFor) {
    return renderTestStep({
      name: `Added to Test ${buildIndex}`,
      detail: `it starts when the ${platformWithEmoji(waitingFor.easBuild)} EAS build is uploaded`,
    });
  }

  const when =
    'easBuilds' in waitingFor
      ? 'the EAS builds are uploaded'
      : `${platformWithEmoji(waitingFor.otherJob)} arrives from the other job (CI run ${waitingFor.ciRunId})`;
  return renderTestStep({ name: `Opened Test ${buildIndex}`, detail: `it starts when ${when}` });
}

/** `✔ Started Test 1             🤖 Android and 🍎 iOS have both arrived` - this job's app build was the last one. */
export function renderRunStarting(buildIndex: number): string {
  return renderTestStep({
    name: `Started Test ${buildIndex}`,
    detail: `${platformWithEmoji('android')} and ${platformWithEmoji('ios')} have both arrived`,
  });
}

/**
 * The refusal a Sherlo 2 command line meets: `sherlo test --android <path>` (operator decision
 * 2026-10-07 - Sherlo 3 tests only app builds it made itself). A CI script that still passes the
 * flag is told what to run instead, not commander's bare "unknown option". Draft words, for the
 * content department's review.
 */
export function renderBinaryPathFlagGone(): { message: string; below: string } {
  return {
    message:
      '`npx sherlo test` builds your app itself, so it no longer takes `--android` or `--ios`, ' +
      'or `android` and `ios` paths in sherlo.config.json.',
    below: [
      'To build ahead of time, run `npx sherlo build`. The next `npx sherlo test` uses the app ' +
        'from the local build cache.',
      "If Gradle or Xcode can't build your app on their own, set `build.android.command` and " +
        '`build.android.output` (or the `ios` ones) in sherlo.config.json.',
    ].join('\n'),
  };
}

/**
 * The refusal of a `--platform` that is neither `android` nor `ios` - a typo in a CI matrix, or
 * `--platform both`. It names the two values and says what leaving the flag out does, so the job is
 * fixed in one edit. Draft words, for the content department's review.
 */
export function renderPlatformUnknown(givenPlatform: string): { message: string; below: string } {
  return {
    message: `\`--platform\` takes \`android\` or \`ios\`, not \`${givenPlatform}\`.`,
    below: 'Leave `--platform` out to test both platforms in one job.',
  };
}

/**
 * `✔ Skipped iOS                sherlo.config.json lists no iOS device, so this job has nothing to run`.
 *
 * The one line a `--platform` job prints when the config tests nothing on its platform - the Mac
 * job of an Android-only team running the one workflow every team gets. It exits 0 and joins no
 * run, so the other job's run never waits for it. Draft words, for the content department's review.
 */
export function renderPlatformNotInConfig(platform: Platform): string {
  return renderTestStep({
    name: `Skipped ${PLATFORM_LABEL[platform]}`,
    detail: `sherlo.config.json lists no ${PLATFORM_LABEL[platform]} device, so this job has nothing to run`,
  });
}
