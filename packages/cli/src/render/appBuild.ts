/**
 * THE APP BUILD LINES - what `sherlo build` prints, and the pieces of an app build that
 * `sherlo test`'s platform rows (./runRows) say too: how long it took, and what native code changed.
 *
 * `sherlo build` speaks in init's grammar (./testSteps), one past-tense line per platform:
 *
 *     ✔ Built the Android app  in 4m 12s (log: .sherlo/build-android.log)
 *
 * and `(already done)` for an app build it found in the local build cache, because building is what
 * that command was asked for. `sherlo test` says what became of each platform's app build in that
 * platform's row instead. The words a build shows while it runs are ./stepInProgress's.
 *
 * Pure, like the rest of the layer: a duration arrives in seconds and is phrased here, never read
 * off a clock. The words are drafts for the content department.
 */
import chalk from 'chalk';
import type { Platform } from '@sherlo/api-types';
import { DOCS_LINK, PLATFORM_LABEL } from '../constants';
import { renderSectionTitle } from './initLines';
import {
  projectPageUrl,
  renderFailedTestStep,
  renderHelpBlock,
  renderTestStep,
  type SherloProject,
} from './testSteps';

/** Why a platform needs a new app build, as the staged gate decided it. */
export type AppBuildReason = 'nothing-stored' | 'native-changed';

/** Which command built the app: a test goes on to upload it, `sherlo build` only keeps it. */
export type AppBuildCommand = 'test' | 'build';

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

function builtTheApp(platform: Platform): string {
  return `Built the ${PLATFORM_LABEL[platform]} app`;
}

/**
 * `sherlo build` found its app build in the local build cache: `✔ Built the Android app  (already
 * done)` - init's own words for a step this run found done, since building is what the command was
 * asked for. Where the app build is kept is the next step's to say.
 */
export function renderAppBuildCached(platform: Platform): string {
  return renderTestStep({ name: builtTheApp(platform), alreadyDone: true });
}

/**
 * `sherlo build` built an app: `✔ Built the Android app      in 1m 28s (log: .sherlo/build-android.log)`.
 * It gives no reason: its next step says where the app build is kept.
 */
export function renderAppBuildDone({
  platform,
  seconds,
  logPath,
}: {
  platform: Platform;
  seconds: number;
  logPath: string;
}): string {
  return renderTestStep({
    name: builtTheApp(platform),
    detail: `in ${formatBuildDuration(seconds)} ${chalk.dim(`(log: ${logPath})`)}`,
  });
}

/**
 * `sherlo build` ends on what the app builds it kept are for: the next `sherlo test` skips building.
 * One sentence that reads right whether it built one platform or two.
 */
export function renderAppBuildNextStep(): string[] {
  return [
    // The underline is one longer than the title: the emoji is counted as one character and drawn as two.
    ...renderSectionTitle('👉 Next step', 12),
    chalk.bold('Test your app'),
    `   ${chalk.cyan(
      'npx sherlo test'
    )} skips building the app until native code or build settings change.`,
  ];
}

/**
 * `sherlo build`'s failed build, in init's failed-step shape: the build tool's last lines quoted,
 * where the whole log is, what to do - and the help block, because the run ends here.
 * (`sherlo test`'s failed build is the failed platform's row, ./runRows.)
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
    ...renderFailedTestStep(`Building the ${PLATFORM_LABEL[platform]} app`),
    `The build failed after ${formatBuildDuration(seconds)}. Last lines of the log:`,
    ...lastLines.map((line) => chalk.dim(`   | ${line}`)),
    '',
    `Full log: ${logPath}`,
    `Fix the build, then run ${chalk.cyan('npx sherlo build')} again.`,
    renderRunOnCi(),
    '',
    ...renderHelpBlock(),
  ];
}

/**
 * The one line every failure to build on this machine ends with, just above the help block
 * (operator, 2026-10-12, through epic init-for-agents): the app can be built on CI instead. It
 * links the project's page in the web app, where a CI token is made, when the run knows its
 * project; otherwise (`sherlo build`, which reads no credential) the docs. Draft words, for the
 * content department.
 *
 * PLAN-LAYER DEBT, NAMED (build item 73): init-for-agents writes the same project address inline
 * (`commands/init/steps/teamAndProject.ts`, `askWhichProject.ts`, `projectCreate.ts`); after it
 * merges, one helper (`projectPageUrl`, ./testSteps) builds it for all of them.
 */
export function renderRunOnCi(project?: SherloProject): string {
  const link = project ? projectPageUrl(project) : DOCS_LINK.testing;
  return `Can't build here? Run Sherlo on your CI instead: ${chalk.cyan(link)}`;
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
