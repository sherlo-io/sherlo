/**
 * A TEST, ONE ROW PER PLATFORM AND ONE FOR THE TEST (operator, 2026-10-13, Q6 - drawn live on the
 * mixed run first, then rolled out to every `sherlo test` screen):
 *
 *     🤖 Android  ✔ Built in 4m 12s, native code changed since Test 3 (log: ...)
 *                   ~ yarn.lock
 *     🍎 iOS      ✔ Reused from Test 3
 *
 *     Test 4      ✔ Started: all 5 stories on 2 devices (Pixel 7, iPhone 15)
 *                   + Storefront/Checkout (2 stories)
 *                   ~ Storefront/ProductCard (3 stories)
 *
 * Every row starts with what it is about, padded to one column, so the marks line up, and every list
 * under a row starts where that row's words start. Every platform has its row - a reused app build
 * included - Android first, then a blank line, then the test's row. The test's row lists the story
 * files it captures by their Storybook titles. A log prints the same rows, each one when it happens
 * (../commands/test/platformRows), and a platform's progress line starts in the same column
 * (./stepInProgress).
 *
 * Pure, like everything under ./. The words are the content department's approved wording.
 */
import chalk from 'chalk';
import type { Platform } from '@sherlo/api-types';
import { PLATFORM_LABEL } from '../constants';
import type { Config } from '../types';
import {
  formatBuildDuration,
  renderNativeChanges,
  renderRunOnCi,
  type WhyANewAppBuild,
} from './appBuild';
import {
  countStories,
  describeWhatRuns,
  platformWithEmoji,
  renderHelpBlock,
  type PlatformCapture,
  type SherloProject,
} from './testSteps';

/** What became of one platform's app build in this run. */
export type PlatformRow =
  | {
      platform: Platform;
      appBuild: 'built' | 'build-failed';
      seconds: number;
      logPath: string;
      why?: WhyANewAppBuild;
      /** An iOS build's files that pod install changed and git does not track, relative to the project root. */
      podFilesChanged?: string[];
    }
  | { platform: Platform; appBuild: 'reused-from-test'; testIndex?: number }
  | {
      platform: Platform;
      appBuild:
        | 'reused-from-local-build-cache'
        | 'arrived-from-other-job'
        | 'building-on-eas'
        | 'built-on-eas'
        | 'still-building-on-eas'
        | 'skipped-not-in-config';
    };

/** The platforms' rows a test's row stands under, as the run recorded them. */
export type RowsAbove = {
  rows: PlatformRow[];
  /** A log printed each row when it happened, so only the blank line under them is left to print. */
  printedAsTheyHappened: boolean;
};

/** What an open test is still waiting for. */
export type TestWaitsFor =
  /** The other job of a split CI run, building the named platform. */
  | { otherJob: Platform }
  /** The EAS builds `sherlo test` started, one per platform named. */
  | { easBuilds: Platform[] }
  /** The one EAS build still to come, seen from inside the EAS build that just delivered its platform. */
  | { easBuild: Platform };

/** Wide enough for the longest label, `🤖 Android`, and two spaces after it. */
const LABEL_WIDTH = 12;

/** Where a row's words start: after the label and the mark. */
const WORDS_START = LABEL_WIDTH + 2;

/** At most this many story files are listed under the test's row; the rest are counted. */
export const STORY_FILES_LISTED = 10;

/** `🤖 Android  ` - a platform's label, padded so whatever follows starts in the rows' column. */
export function platformLabelColumn(platform: Platform): string {
  return platformWithEmoji(platform).padEnd(LABEL_WIDTH);
}

/** One platform's row, and the native changes under it when it was built. */
export function renderPlatformRow(row: PlatformRow): string[] {
  const label = platformWithEmoji(row.platform);

  switch (row.appBuild) {
    case 'built':
    case 'build-failed': {
      const words =
        row.appBuild === 'built'
          ? `Built in ${formatBuildDuration(row.seconds)}`
          : `Build failed after ${formatBuildDuration(row.seconds)}`;
      const why = whyBuilt(row.why);
      const mark = row.appBuild === 'built' ? chalk.green('✔') : chalk.red('✖');
      const changes = row.why?.changesSince?.changes ?? [];
      // The native-change list carries its own indent for a step line; under a row it starts at the words.
      const changeLines = renderNativeChanges(changes).map((line) => line.trimStart());

      return [
        renderRow(
          label,
          `${words}${why ? `, ${why}` : ''} ${chalk.dim(`(log: ${row.logPath})`)}`,
          mark
        ),
        ...underTheRow(changeLines),
        ...underTheRow(podFilesWarning(row.podFilesChanged ?? [])),
      ];
    }

    case 'reused-from-test':
      return [
        renderRow(
          label,
          row.testIndex !== undefined ? `Reused from Test ${row.testIndex}` : 'Reused'
        ),
      ];

    case 'reused-from-local-build-cache':
      return [renderRow(label, 'Reused from the local build cache')];

    case 'arrived-from-other-job':
      return [renderRow(label, 'Arrived from the other job')];

    case 'building-on-eas':
      return [renderRow(label, 'Building on EAS')];

    case 'built-on-eas':
      return [renderRow(label, 'Built on EAS')];

    case 'still-building-on-eas':
      return [renderRow(label, 'Still building on EAS', chalk.dim('…'))];

    case 'skipped-not-in-config':
      // The one row a `--platform` job prints when its config tests nothing on that platform.
      return [
        renderRow(
          label,
          `Skipped: sherlo.config.json lists no ${PLATFORM_LABEL[row.platform]} device`
        ),
      ];
  }
}

/**
 * `Test 4      ✔ Started: all 5 stories on 2 devices (Pixel 7, iPhone 15)`, under the platforms'
 * rows, with the story files it captures under it.
 */
export function renderTestStarted({
  rowsAbove,
  buildIndex,
  devices,
  capture = [],
}: {
  rowsAbove: RowsAbove;
  buildIndex: number;
  devices?: Config['devices'];
  capture?: PlatformCapture[];
}): string[] {
  const whatRuns = describeWhatRuns({ devices, capture });
  return [
    ...renderRowsAbove(rowsAbove),
    renderRow(testLabel(buildIndex), whatRuns ? `Started: ${whatRuns}` : 'Started'),
    ...underTheRow(storyFilesCaptured(capture)),
  ];
}

/**
 * The test is open and waits for app builds still to come, under the platforms' rows:
 *
 *     Test 1      ✔ Opened: starts when 🍎 iOS arrives from the other job
 *     Test 1      ✔ Opened: starts when both EAS builds finish
 *     Test 1      ✔ Added: starts when the 🍎 iOS EAS build finishes
 *
 * The last is the EAS build that delivered its own platform first: `sherlo test` opened the test,
 * and this build only joined it. The last app build in starts the test, with the ordinary Started row.
 */
export function renderTestWaiting({
  rowsAbove,
  buildIndex,
  waitingFor,
}: {
  rowsAbove: RowsAbove;
  buildIndex: number;
  waitingFor: TestWaitsFor;
}): string[] {
  return [
    ...renderRowsAbove(rowsAbove),
    renderRow(testLabel(buildIndex), whatTheTestWaitsFor(waitingFor)),
  ];
}

/** `Test 15     ✔ Finished: nothing to test: <the server's reason>` - a test the server closed. */
export function renderTestFinishedWithNothingToTest({
  rowsAbove,
  testIndex,
  reason,
}: {
  rowsAbove: RowsAbove;
  testIndex: number;
  reason: string;
}): string[] {
  return [
    ...renderRowsAbove(rowsAbove),
    renderRow(
      testLabel(testIndex),
      reason ? `Finished: nothing to test: ${reason}` : 'Finished: nothing to test'
    ),
  ];
}

/** `            ✔ Finished in 3m 5s` - the wait's own step, under the test's row, its label column blank. */
export function renderFinishedUnderTheTestRow(seconds: number): string {
  return renderRow('', `Finished in ${formatBuildDuration(seconds)}`);
}

/**
 * A platform's app build failed, so nothing was tested (operator, Q5): the platforms' rows - the
 * failed one with what changed under it - then the build tool's last lines, what to do, and help.
 */
export function renderTestStoppedOnFailedBuild({
  rowsAbove,
  lastLines,
  project,
}: {
  rowsAbove: RowsAbove;
  lastLines: string[];
  /** The project the run pushes to: the "build on CI" line links its page. */
  project?: SherloProject;
}): string[] {
  return [
    ...renderRowsAbove(rowsAbove),
    'Last lines of the log:',
    ...lastLines.map((line) => chalk.dim(`   | ${line}`)),
    '',
    `Nothing was uploaded and no test was started. Fix the build, then run ${chalk.cyan(
      'npx sherlo test'
    )} again.`,
    renderRunOnCi(project),
    '',
    ...renderHelpBlock(),
  ];
}

/* ========================================================================== */

/**
 * The platforms' rows in a fixed order, Android first, and the blank line that sets the test apart
 * from the app builds it runs on. A log already printed the rows; the blank line is still owed.
 */
function renderRowsAbove({ rows, printedAsTheyHappened }: RowsAbove): string[] {
  if (rows.length === 0) return [];
  if (printedAsTheyHappened) return [''];

  const androidFirst = [...rows].sort((a, b) => a.platform.localeCompare(b.platform));
  return [...androidFirst.flatMap(renderPlatformRow), ''];
}

function testLabel(buildIndex: number): string {
  return `Test ${buildIndex}`;
}

/** `native code changed since Test 12`; a first build gives no reason. */
function whyBuilt(why: WhyANewAppBuild | undefined): string | undefined {
  if (!why || why.reason === 'nothing-stored') return undefined;

  const storedIn = why.changesSince?.storedBuildIndex ?? why.storedBuildIndex;
  return storedIn !== undefined
    ? `native code changed since Test ${storedIn}`
    : 'native code changed';
}

/** The warning to commit what pod install changed, then the files; nothing when it changed none. */
function podFilesWarning(podFilesChanged: string[]): string[] {
  if (podFilesChanged.length === 0) return [];

  return [
    'Pod install changed files that git does not track. Commit them so the next run can reuse the iOS app build:',
    ...podFilesChanged,
  ];
}

/** `Opened: starts when ...` / `Added: starts when ...`. */
function whatTheTestWaitsFor(waitingFor: TestWaitsFor): string {
  if ('easBuild' in waitingFor) {
    return `Added: starts when the ${platformWithEmoji(waitingFor.easBuild)} EAS build finishes`;
  }
  if ('otherJob' in waitingFor) {
    return `Opened: starts when ${platformWithEmoji(
      waitingFor.otherJob
    )} arrives from the other job`;
  }
  // The platforms' rows above name the EAS builds.
  return waitingFor.easBuilds.length > 1
    ? 'Opened: starts when both EAS builds finish'
    : 'Opened: starts when the EAS build finishes';
}

/** `🍎 iOS      ✔ Reused from Test 3` */
function renderRow(label: string, words: string, mark: string = chalk.green('✔')): string {
  return `${label.padEnd(LABEL_WIDTH)}${mark} ${words}`;
}

/** Lines under a row, starting where its words start. */
function underTheRow(lines: string[]): string[] {
  return lines.map((line) => `${' '.repeat(WORDS_START)}${line}`);
}

/**
 * The story files the test captures, every platform's together, each named once: `+` a story file
 * the build it diffed against did not have, `~` one a change reaches, and unmarked one captured
 * though nothing it uses changed (every story is captured when no main branch is set). New first,
 * then changed. A file only one platform has says which.
 */
function storyFilesCaptured(capture: PlatformCapture[]): string[] {
  const added = filesOfEveryPlatform(capture, ({ newStoryFiles }) => newStoryFiles);
  const changed = filesOfEveryPlatform(capture, ({ changedStoryFiles }) => changedStoryFiles);
  const captured = filesOfEveryPlatform(capture, ({ storyFiles }) => storyFiles);

  const everyPlatform = capture.length;
  const titledFileOf = (file: string) =>
    capture
      .flatMap(({ storyTitles }) => storyTitles ?? [])
      .find((titled) => titled.storyFile === file);
  const describe = (file: string, platforms: Platform[]): string => {
    // `Storefront/ProductCard (3 stories)`: the name the web app shows, or the path when no title
    // is recorded, and the count only when one is recorded.
    const titled = titledFileOf(file);
    const countNote =
      titled?.stories !== undefined ? ` ${chalk.dim(`(${countStories(titled.stories)})`)}` : '';
    const name = `${titled?.title ?? file}${countNote}`;
    return platforms.length < everyPlatform
      ? `${name} ${chalk.dim(`(${platformWithEmoji(platforms[0])} only)`)}`
      : name;
  };
  const markOf = (file: string): string => {
    if (added.has(file)) return chalk.green('+');
    if (changed.has(file)) return chalk.yellow('~');
    return ' ';
  };

  // New first, then changed, then the rest: what most needs a look comes first.
  const order = (file: string): number => (added.has(file) ? 0 : changed.has(file) ? 1 : 2);
  const lines = [...captured]
    .sort(([a], [b]) => order(a) - order(b))
    .map(([file, platforms]) => `${markOf(file)} ${describe(file, platforms)}`);

  const listed = lines.slice(0, STORY_FILES_LISTED);
  const notListed = lines.length - listed.length;
  return notListed > 0 ? [...listed, chalk.dim(`  and ${notListed} more`)] : listed;
}

/** Each story file the platforms name, with the platforms that name it. */
function filesOfEveryPlatform(
  capture: PlatformCapture[],
  filesOf: (platformCapture: PlatformCapture) => string[] | undefined
): Map<string, Platform[]> {
  const platformsOfFile = new Map<string, Platform[]>();
  for (const platformCapture of capture) {
    for (const file of filesOf(platformCapture) ?? []) {
      platformsOfFile.set(file, [...(platformsOfFile.get(file) ?? []), platformCapture.platform]);
    }
  }
  return platformsOfFile;
}
