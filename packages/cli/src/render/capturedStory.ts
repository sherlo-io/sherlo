/**
 * WHAT `sherlo capture` PRINTS.
 *
 * Pure, like everything under ./: state in, lines out. The road that produces the state is the
 * capture socket on the bundler (../seams/captureSocket); a posed run states the answer and a real
 * run gets it from the app, and neither changes a line of what is printed.
 *
 * AN AGENT IS A FIRST-CLASS READER, so every ending is named. The refusals are word for word the
 * ones `sherlo open` prints (./openedStory), because they are the same facts about the same road -
 * a developer who has met one command's refusal has already met the other's.
 *
 * THE VIEW TREE IS A SHORT ACCOUNT, NOT THE RECORD. A screenful of it, starting at the story's own
 * root, with the app's own component names to the left of the primitive each one renders. The
 * whole record is `--json`, which prints no screen at all - it is JSON for a program to read.
 */
import chalk from 'chalk';

/** One view in the tree, as the screen needs it. */
export type CapturedView = {
  /** The native primitive: `View`, `Text`, `Image`. */
  primitive: string;
  /** The app's own components that render this view, outermost first. Empty when none have names. */
  components: string[];
  /** What a text view says, when it says anything. */
  text?: string;
  children: CapturedView[];
};

/** How a run of `sherlo capture` ended, as the screen needs it. */
export type CapturedStory =
  | { kind: 'no-bundler'; port: number }
  | { kind: 'no-app'; port: number }
  | { kind: 'no-such-story'; storyId: string; known: string[] }
  | {
      kind: 'captured';
      storyId: string;
      settledMs: number;
      frames: number;
      /** How many screenfuls the story was captured in - absent or 1 is a story that fits one screen. */
      parts?: number;
      /** Whether any view in the story loads an image over the network. */
      hasNetworkImage?: boolean;
      tree: CapturedView;
    }
  /**
   * The screen never stopped changing before the stabilization gave up. A cloud run would hit the
   * same limit on the same story, which is exactly why a developer needs to hear it here.
   */
  | { kind: 'never-settled'; storyId: string; seconds: number; tree: CapturedView }
  /** The story threw while rendering; the error is the story's own, word for word. */
  | {
      kind: 'captured-and-threw';
      storyId: string;
      threw: { name: string; message: string };
      tree: CapturedView;
    }
  /** The app stopped answering mid-capture - a fatal error, a native crash, or the app being closed. */
  | {
      kind: 'crashed';
      storyId: string;
      /** The fatal error's own words, when the app reported it before it died. */
      error?: { name: string; message: string };
    };

/** How many views the short account shows before it says how many more there are. */
const VIEWS_SHOWN = 12;

const START_THE_APP = 'Start your app with the bundler running, then try again.';

/** Every line `sherlo capture` prints, in order. */
export function renderCapturedStory(state: CapturedStory): string[] {
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

    case 'captured':
      return [
        `${chalk.green('✔')}  ${chalk.bold(state.storyId)} captured, the way a test run records it`,
        chalk.dim(
          `   settled in ${seconds(state.settledMs)} over ${state.frames} frames · testing mode`
        ),
        ...(state.parts !== undefined && state.parts > 1
          ? [chalk.dim(`   captured in ${state.parts} screenfuls - the story scrolls past the first`)]
          : []),
        ...(state.hasNetworkImage
          ? [chalk.dim('   has images loaded over the network - a cloud capture depends on them')]
          : []),
        '',
        ...treeLines(state.tree),
        '',
      ];

    case 'never-settled':
      return [
        `${chalk.yellow('◦')}  ${chalk.bold(state.storyId)} never stopped changing within ${
          state.seconds
        }s`,
        chalk.dim('   A test run of this story would stop at the same limit. What it read then:'),
        '',
        ...treeLines(state.tree),
        '',
      ];

    case 'captured-and-threw':
      return [
        `${chalk.red('✖')}  ${chalk.bold(state.storyId)} captured, and it threw while rendering`,
        '',
        `  ${state.threw.name}: ${state.threw.message}`,
        '',
        ...treeLines(state.tree),
        '',
      ];

    case 'crashed':
      return [
        `${chalk.red('✖')}  ${chalk.bold(state.storyId)} captured to a crash - the app stopped answering`,
        '',
        ...(state.error
          ? [`  ${state.error.name}: ${state.error.message}`]
          : [
              chalk.dim(
                '   The app said nothing before it died - a native crash, or the app was closed.'
              ),
            ]),
        '',
      ];
  }
}

/* ========================================================================== */

/**
 * The tree as a screenful: the root on its own line, then its descendants drawn with branches,
 * stopping after {@link VIEWS_SHOWN} and saying how many more there are and where the rest is.
 */
function treeLines(root: CapturedView): string[] {
  const lines = [`   ${label(root)}`];
  const flat = descendants(root);

  const shown = flat.slice(0, VIEWS_SHOWN);
  shown.forEach(({ view, depth, last }) => {
    lines.push(`   ${'│  '.repeat(depth)}${last ? '└─' : '├─'} ${label(view)}`);
  });

  const rest = flat.length - shown.length;
  if (rest > 0) lines.push(chalk.dim(`   … ${rest} more views`));

  lines.push('', chalk.dim(`   ${flat.length + 1} views · add --json for the full record`));
  return lines;
}

/** `SectionTitle › Text  "FONT SIZES"` - the app's names, the primitive, and what it says. */
function label(view: CapturedView): string {
  const names = view.components.length > 0 ? `${view.components.join(' › ')} › ` : '';
  const text = view.text === undefined ? '' : `  ${chalk.dim(JSON.stringify(view.text))}`;
  return `${names}${chalk.bold(view.primitive)}${text}`;
}

function descendants(
  view: CapturedView,
  depth = 0
): { view: CapturedView; depth: number; last: boolean }[] {
  return view.children.flatMap((child, index) => [
    { view: child, depth, last: index === view.children.length - 1 },
    ...descendants(child, depth + 1),
  ]);
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** The same handful-and-a-count `sherlo open` offers, for the same reason. */
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
