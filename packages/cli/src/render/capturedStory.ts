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
 * THE VIEW TREE IS THE RECORD, DRAWN THE WAY SHERLO'S WEB INSPECTOR DRAWS IT. Every view, none
 * left out, as the tag the inspector names it by, its style block one key per line in the
 * inspector's order (./inspectorStyle), its size in points after the opening tag, and - the two
 * things the inspector does not show - the words a text view draws, between its tags, and the
 * app's own components as tags around the view they render. `--json` prints the record, no screen.
 */
import chalk from 'chalk';
import { inkOn, inspectorHex, inspectorStyleEntries, isColourKey } from './inspectorStyle';

/** One view in the tree, as the screen needs it. */
export type CapturedView = {
  /** The tag the inspector names the view by: `View`, `Text`, `Image`. */
  primitive: string;
  /** The app's own components that render this view, outermost first. Empty when none have names. */
  components: string[];
  /** What a text view says, when it says anything. */
  text?: string;
  /** The view's box in points, as the inspector reports it. */
  size?: { width: number; height: number };
  /** The React style matched to the view, as one object, with the keys the source wrote. */
  style?: Record<string, unknown>;
  /** The other props the screen prints beside the style: a placeholder, a testID, numberOfLines. */
  props?: Record<string, string | number | boolean>;
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
          ? [
              chalk.dim(
                `   captured in ${state.parts} screenfuls - the story scrolls past the first`
              ),
            ]
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
        `${chalk.red('✖')}  ${chalk.bold(
          state.storyId
        )} captured to a crash - the app stopped answering`,
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
 * The inspector's palette, colour for colour, so the screen and the build page read as one
 * rendering. A terminal with fewer colours shows the nearest it has.
 */
const INK = {
  punct: chalk.hex('#CEB87D'),
  tag: chalk.hex('#67B5A4'),
  attr: chalk.hex('#BABABA'),
  eq: chalk.hex('#7DA776'),
  key: chalk.hex('#BA83BA'),
  inner: chalk.hex('#BCBEC3'),
  curly: chalk.hex('#5FA8B7'),
  value: chalk.hex('#E6C07B'),
  comment: chalk.hex('#7B7E84'),
  /** The one colour the inspector does not have: the app's own components, which it never shows. */
  component: chalk.hex('#D97AB8'),
};

/** The whole tree, every view, drawn as the inspector draws it, then how many views that was. */
function treeLines(root: CapturedView): string[] {
  return [...viewLines(root, 0), '', chalk.dim(`   ${countViews(root)} views · --json prints the record`)];
}

/**
 * One view as the inspector draws it, and everything under it. A view with nothing but a tag is
 * `<View>` on one line; a view with props opens its tag over several, the style block one key per
 * line, and closes it on a line of its own. The size follows the opening tag, in points. What a
 * text view says goes between its tags, where JSX would put it.
 *
 * THE APP'S OWN COMPONENTS ARE TAGS OF THE TREE, in a colour of their own: `SectionTitle` renders
 * a `Text`, so the screen shows `<SectionTitle>` wrapping `<Text>`, outermost first, the way the
 * source nests them. They are part of the tree rather than a note beside it, because a reviewer
 * points at "the header" and a developer looks for the component they wrote.
 */
function viewLines(view: CapturedView, depth: number): string[] {
  const lines: string[] = [];

  view.components.forEach((name, index) => {
    lines.push(`${indent(depth + index)}${INK.punct('<')}${INK.component(name)}${INK.punct('>')}`);
  });
  lines.push(...primitiveLines(view, depth + view.components.length));
  for (let index = view.components.length - 1; index >= 0; index -= 1) {
    lines.push(
      `${indent(depth + index)}${INK.punct('</')}${INK.component(view.components[index])}${INK.punct('>')}`
    );
  }

  return lines;
}

function indent(depth: number): string {
  return `   ${'  '.repeat(depth)}`;
}

/** The native view itself: its tag, its props, its style block, its size, its words and its children. */
function primitiveLines(view: CapturedView, depth: number): string[] {
  const pad = indent(depth);
  const lines: string[] = [];

  const tag = INK.tag(view.primitive);
  const size = view.size ? ` ${INK.comment(`(${view.size.width} x ${view.size.height})`)}` : '';
  const props = Object.entries(view.props ?? {});
  const style = inspectorStyleEntries(view.style);
  const hasBody = view.text !== undefined || view.children.length > 0;
  const closer = hasBody ? INK.punct('>') : INK.punct('/>');

  if (props.length === 0 && style.length === 0) {
    lines.push(`${pad}${INK.punct('<')}${tag}${hasBody ? '' : ' '}${closer}${size}`);
  } else {
    lines.push(`${pad}${INK.punct('<')}${tag}`);
    for (const [name, value] of props) {
      lines.push(`${pad}  ${INK.attr(name)}${INK.eq('=')}${propValue(value)}`);
    }
    if (style.length > 0) {
      lines.push(`${pad}  ${INK.attr('style')}${INK.eq('=')}${INK.curly('{{')}`);
      style.forEach(([key, value], index) => {
        const comma = index < style.length - 1 ? INK.inner(',') : '';
        lines.push(`${pad}    ${INK.key(key)}${INK.inner(':')} ${styleValue(key, value)}${comma}`);
      });
      lines.push(`${pad}  ${INK.curly('}}')}`);
    }
    lines.push(`${pad}${closer}${size}`);
  }

  if (hasBody) {
    if (view.text !== undefined) lines.push(`${pad}  ${view.text}`);
    for (const child of view.children) lines.push(...viewLines(child, depth + 1));
    lines.push(`${pad}${INK.punct('</')}${tag}${INK.punct('>')}`);
  }

  return lines;
}

/** A prop the way JSX writes it: a string in quotes, anything else in braces. */
function propValue(value: string | number | boolean): string {
  if (typeof value === 'string') return INK.value(JSON.stringify(value));
  return `${INK.curly('{')}${INK.value(String(value))}${INK.curly('}')}`;
}

/**
 * A style value the way the inspector shows it: a colour on a swatch of itself, a string in
 * quotes, a number bare, and a transform as its parts.
 */
function styleValue(key: string, value: unknown): string {
  if (typeof value === 'string') {
    if (isColourKey(key) && value !== 'transparent') {
      const hex = inspectorHex(value);
      if (hex.startsWith('#')) {
        return `${INK.value('"')}${chalk.bgHex(hex).hex(inkOn(hex))(hex)}${INK.value('"')}`;
      }
    }
    return INK.value(JSON.stringify(value));
  }
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
    return INK.value(JSON.stringify(transformParts(value)));
  }
  return INK.value(String(value));
}

/** `[{ rotate: "45deg" }, { scale: 1.2 }]` reads as `rotate(45deg) scale(1.2)`, as the inspector shows it. */
function transformParts(value: unknown): string {
  const entries = Array.isArray(value) ? value : [value];
  return entries
    .map((entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        return Object.entries(entry as Record<string, unknown>)
          .map(([name, part]) => `${name}(${Array.isArray(part) ? part.join(', ') : String(part)})`)
          .join(' ');
      }
      return String(entry);
    })
    .join(', ');
}

function countViews(view: CapturedView): number {
  return 1 + view.children.reduce((sum, child) => sum + countViews(child), 0);
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
