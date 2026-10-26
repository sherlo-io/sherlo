/**
 * WHAT `sherlo capture --scene` PRINTS.
 *
 * Pure, like everything under ./: state in, lines out. A scene is one variant of one screen; the
 * app is booted fresh on its first screen, its play steps tap and open links until the scene's
 * ready view shows, and it is stabilized and read. The route is the one the app's own navigation
 * reached, read from the app; a scene file names no route. The road that produces the state is the capture
 * socket (../seams/captureSocket); a posed run states the answer and a real run gets it from the
 * app, and neither changes a line of what is printed.
 *
 * EVERY ENDING IS NAMED, as it is for a story (./capturedStory), and the two bundler refusals are
 * the story screen's own. The tree is the story screen's tree: one drawing of a view, not two.
 */
import chalk from 'chalk';
import { treeLines, renderCapturedStory, seconds, settledLine } from './capturedStory';
import type { CapturedView } from './capturedStory';

/** One step of a scene's `play`, as the scene file wrote it: a tap by testID, or one of the app's own links. */
export type PlayStep = { tap: string } | { open: string };

/** How a scene run ended, without the bundler's two refusals, which carry a port. */
export type SceneEnding =
  | { kind: 'no-such-scene'; sceneId: string; known: string[] }
  /** The app's own JS threw while it started, before any scene could be put on it. */
  | {
      kind: 'crashed-at-boot';
      sceneId: string;
      error: { name: string; message: string; file: string; line: number };
    }
  /** The app booted, and the scene's ready view never showed; `stayedOn` is the route the app was on. */
  | {
      kind: 'never-reached';
      sceneId: string;
      ready: string;
      stayedOn: string[];
      /** The test ids on screen when the wait gave up, for the json reply only. */
      seen?: { testIDs: string[]; more: number };
    }
  /** A play step found no view with its testID within its limit; `route` is where the app stood. */
  | {
      kind: 'play-target-missing';
      sceneId: string;
      route: string[];
      /** The steps done before the one that found nothing. */
      done: PlayStep[];
      missing: { tap: string };
      limitMs: number;
    }
  /** The app took the capture and started over `restarts` times, and no picture came of it. */
  | { kind: 'restarted-mid-capture'; sceneId: string; restarts: number }
  /** The record. `bootMs` is the fresh boot; `reached.ms` is from there to the ready view showing. */
  | {
      kind: 'scene';
      sceneId: string;
      bootMs: number;
      reached: { route: string[]; ms: number };
      play: PlayStep[];
      settled: { ms: number; frames: number };
      /** The phone's own density and font scale; absent when an older app says nothing of them. */
      density?: number;
      fontScale?: number;
      tree: CapturedView;
    };

/** How a run of `sherlo capture --scene` ended, as the screen needs it. */
export type CapturedScene =
  | { kind: 'no-bundler'; port: number }
  | { kind: 'no-app'; port: number }
  | SceneEnding;

/** Every line `sherlo capture --scene` prints, in order. */
export function renderCapturedScene(state: CapturedScene): string[] {
  switch (state.kind) {
    case 'no-bundler':
    case 'no-app':
      return renderCapturedStory(state);

    case 'no-such-scene':
      return noSuchSceneLines(state.sceneId, state.known);

    case 'crashed-at-boot': {
      const { name, message, file, line } = state.error;
      return [
        `${chalk.red('✖')}  ${chalk.bold(state.sceneId)} never booted - the app's own code threw at start`,
        '',
        `  ${name}: ${message} (${file}:${line})`,
        '',
      ];
    }

    case 'never-reached':
      return [
        `${chalk.red('✖')}  ${chalk.bold(state.sceneId)} never got ready - no view ${
          state.ready
        } showed, and the app stayed on ${route(state.stayedOn)}`,
        '',
        '  Nothing faked who is logged in, so the app sent itself to sign-in. ' +
          "Add a logged-in user to the scene's mocks.",
        '',
      ];

    case 'play-target-missing':
      return [
        `${chalk.red('✖')}  ${chalk.bold(state.sceneId)} stopped on ${route(
          state.route
        )} - its play could not go on`,
        ...state.done.map((step) => chalk.dim(`   ${playStep(step)}`)),
        '',
        `  ${missedStep(state.missing.tap)} within ${state.limitMs / 1000}s.`,
        '',
      ];

    case 'restarted-mid-capture':
      return [
        `${chalk.red('✖')}  ${chalk.bold(state.sceneId)} never finished - the app started over ${
          state.restarts
        } ${state.restarts === 1 ? 'time' : 'times'} while it was being captured`,
        '',
        '  Add --json to see the log lines of each restart and what the bundler saw before it.',
        '',
      ];

    case 'scene':
      return [
        `${chalk.green('✔')}  ${chalk.bold(state.sceneId)} captured, the way a test run records it`,
        chalk.dim(`   booted fresh in ${seconds(state.bootMs)}`),
        ...state.play.map((step) => chalk.dim(`   played ${playStep(step)}`)),
        chalk.dim(`   reached ${route(state.reached.route)} in ${seconds(state.reached.ms)}`),
        settledLine(state.settled.ms, state.settled.frames),
        '',
        ...treeLines(state.tree),
        '',
      ];
  }
}

/* ========================================================================== */

/** `ChatStack › Chat` - the route as the app's navigation names it, outermost first. */
export function route(names: string[]): string {
  return names.join(' › ');
}

/**
 * `tap chat-header-menu found no view with that testID`. The app spells a tap by text or label as
 * `text "Row"` / `label "Row"`; a bare name is a testID.
 */
function missedStep(tap: string): string {
  const [, by, name] = /^(text|label) "([\s\S]*)"$/.exec(tap) ?? [];
  return `tap ${by ? name : tap} found no view with that ${by ?? 'testID'}`;
}

/** `tap chat-header-menu` or `open feeld://chat-list` - one play step, spelt as the scene file spells it. */
export function playStep(step: PlayStep): string {
  return 'tap' in step ? `tap ${step.tap}` : `open ${step.open}`;
}

/** The refusal for a scene id the app does not have, shared by `open --scene` and `capture --scene`. */
export function noSuchSceneLines(sceneId: string, known: string[]): string[] {
  return [
    `${chalk.red('✖')}  No scene ${chalk.bold(sceneId)} in this app`,
    '',
    ...closestScenes(sceneId, known),
    '',
  ];
}

/**
 * The scenes offered back when the id was wrong: the few nearest to what was typed, by edit
 * distance, so a typo finds its target and a different screen's scenes stay out of the way.
 */
function closestScenes(typed: string, known: string[]): string[] {
  if (known.length === 0) return [chalk.dim('This app has no scenes at all.')];

  const nearest = [...known]
    .sort((a, b) => editDistance(typed, a) - editDistance(typed, b))
    .slice(0, 3);

  return [
    chalk.dim(`Closest of this app's ${known.length} scenes:`),
    ...nearest.map((id) => `  ${id}`),
  ];
}

/** How many single-character edits turn one string into the other. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const swap = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + swap
      );
    }
    previous = current;
  }

  return previous[b.length];
}
