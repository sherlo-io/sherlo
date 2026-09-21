/**
 * WHAT `sherlo open` AND `sherlo inspect` PRINT.
 *
 * Pure, like everything under ./: state in, lines out. Two commands share one file because they
 * share one road and one set of refusals - a bundler that is not there, an app that never
 * connected - and a reader comparing their screens should not have to open two.
 *
 * AN AGENT IS A FIRST-CLASS READER HERE, which is why every ending is named and none of them is a
 * bare stack trace. A person skims the first line; an agent reads the same line and acts on it.
 *
 * The road that produces the state they print is the letterbox on the bundler (../seams/letterbox),
 * and these screens are the same either way: a posed run states the answer, a real run gets it from
 * a bundler with an app attached, and neither changes a line of what is printed.
 */
import chalk from 'chalk';

/** How a run of `sherlo open` ended, as the screen needs it. */
export type OpenedStory =
  | { kind: 'no-bundler'; port: number }
  | { kind: 'no-app'; port: number }
  | { kind: 'no-such-story'; storyId: string; known: string[] }
  | { kind: 'opened'; storyId: string; waited: boolean }
  /**
   * The app painted the story and the story threw while it did. The error is the one the story
   * itself recorded, carried here word for word: the developer reading this is the one who has to
   * fix it, and a paraphrase would send them looking for words their app never printed.
   */
  | { kind: 'painted-and-threw'; storyId: string; threw: { name: string; message: string } }
  | { kind: 'timed-out'; storyId: string; seconds: number };

/** How a run of `sherlo inspect` ended. */
export type InspectedStory =
  | { kind: 'no-bundler'; port: number }
  | { kind: 'no-app'; port: number }
  /** An app IS attached to the bundler; it is showing itself rather than the story browser. */
  | { kind: 'not-at-story-browser' }
  | { kind: 'showing'; storyId: string };

const START_THE_APP = 'Start your app with the bundler running, then try again.';

/** Every line `sherlo open` prints, in order. */
export function renderOpenedStory(state: OpenedStory): string[] {
  switch (state.kind) {
    case 'no-bundler':
      return [
        `${chalk.red('✖')}  No bundler on port ${chalk.bold(String(state.port))}`,
        '',
        chalk.dim(START_THE_APP),
        '',
      ];

    case 'no-app':
      return [
        `${chalk.red('✖')}  A bundler is running on port ${chalk.bold(
          String(state.port)
        )}, and no Sherlo app is attached to it`,
        '',
        chalk.dim('Open the app on a device or simulator, then try again.'),
        '',
      ];

    case 'no-such-story':
      return [
        `${chalk.red('✖')}  No story ${chalk.bold(state.storyId)} in this app`,
        '',
        ...suggestions(state.known),
        '',
      ];

    case 'opened':
      return [
        `${chalk.green('✔')}  ${chalk.bold(state.storyId)} is on screen`,
        '',
        chalk.dim(
          state.waited
            ? 'Next: `sherlo capture` records it the way a test run would.'
            : 'Next: `sherlo open --story <id> --wait` waits until the story has drawn.'
        ),
        '',
      ];

    case 'painted-and-threw':
      return [
        `${chalk.red('✖')}  ${chalk.bold(
          state.storyId
        )} is on screen, and it threw while rendering`,
        '',
        `  ${state.threw.name}: ${state.threw.message}`,
        '',
        chalk.dim('The app is showing that error in place of the story.'),
        '',
      ];

    case 'timed-out':
      return [
        `${chalk.yellow('◦')}  ${chalk.bold(state.storyId)} was sent, and the app did not report ` +
          `it within ${state.seconds}s`,
        '',
        chalk.dim('The app may still be loading it. `sherlo inspect` says what is showing now.'),
        '',
      ];
  }
}

/** Every line `sherlo inspect` prints, in order. */
export function renderInspectedStory(state: InspectedStory): string[] {
  switch (state.kind) {
    case 'no-bundler':
      return [
        `${chalk.red('✖')}  No bundler on port ${chalk.bold(String(state.port))}`,
        '',
        chalk.dim(START_THE_APP),
        '',
      ];

    case 'no-app':
      return [
        `${chalk.red('✖')}  A bundler is running on port ${chalk.bold(
          String(state.port)
        )}, and no Sherlo app is attached to it`,
        '',
        chalk.dim('Open the app on a device or simulator, then try again.'),
        '',
      ];

    case 'not-at-story-browser':
      return [
        `${chalk.yellow('◦')}  The app is attached, and is not showing a story right now`,
        '',
        chalk.dim(
          'It is showing itself rather than the story browser. `sherlo open --story <id>` sends it there.'
        ),
        '',
      ];

    case 'showing':
      return [`${chalk.bold(state.storyId)}`, ''];
  }
}

/* ========================================================================== */

/**
 * The stories offered back when the id was wrong.
 *
 * A handful, not the whole list: an app has hundreds, and a refusal that scrolls off the screen
 * has told the reader nothing. The count says how many more there are, so nobody thinks the app
 * has four stories.
 */
function suggestions(known: string[]): string[] {
  if (known.length === 0) return [chalk.dim('This app lists no stories at all.')];

  const shown = known.slice(0, 4);
  const rest = known.length - shown.length;

  return [
    chalk.dim('This app has:'),
    ...shown.map((storyId) => `  ${storyId}`),
    ...(rest > 0 ? [chalk.dim(`  ... and ${rest} more`)] : []),
  ];
}
