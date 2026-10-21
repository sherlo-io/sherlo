/**
 * WHAT `sherlo capture --scene` PRINTS.
 *
 * Pure, like everything under ./: state in, lines out. A scene is one variant of one screen; the
 * app is booted fresh for it, moved to the scene's route through its own navigation, made to run
 * the scene's play steps, stabilized and read. The road that produces the state is the capture
 * socket (../seams/captureSocket); a posed run states the answer and a real run gets it from the
 * app, and neither changes a line of what is printed.
 *
 * EVERY ENDING IS NAMED, as it is for a story (./capturedStory), and the two bundler refusals are
 * the story screen's own. The tree is the story screen's tree: one drawing of a view, not two.
 */
import chalk from 'chalk';
import { treeLines, renderCapturedStory } from './capturedStory';
import type { CapturedView } from './capturedStory';

/** One step of a scene's `play`, as the scene file wrote it. Today the only step is a tap by testID. */
export type PlayStep = { tap: string };

/** How a scene run ended, without the bundler's two refusals, which carry a port. */
export type SceneEnding =
  | { kind: 'no-such-scene'; sceneId: string; known: string[] }
  /** The app's own JS threw while it started, before any scene could be put on it. */
  | {
      kind: 'crashed-at-boot';
      sceneId: string;
      error: { name: string; message: string; file: string; line: number };
    }
  /** The app booted, and the navigation handle never ended up on the scene's route. */
  | { kind: 'never-reached'; sceneId: string; wanted: string[]; stayedOn: string[] }
  /** The route was reached, and a play step found no view with its testID within its limit. */
  | {
      kind: 'play-target-missing';
      sceneId: string;
      route: string[];
      /** The steps done before the one that found nothing. */
      done: PlayStep[];
      missing: PlayStep;
      limitMs: number;
    }
  /** The record. `bootMs` is the fresh boot; `reached.ms` is the move from there to the route. */
  | {
      kind: 'scene';
      sceneId: string;
      bootMs: number;
      reached: { route: string[]; ms: number };
      play: PlayStep[];
      settled: { ms: number; frames: number };
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
      return [
        `${chalk.red('✖')}  No scene ${chalk.bold(state.sceneId)} in this app`,
        '',
        ...closestScenes(state.sceneId, state.known),
        '',
      ];

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
        `${chalk.red('✖')}  ${chalk.bold(state.sceneId)} never reached ${route(
          state.wanted
        )} - the app stayed on ${route(state.stayedOn)}`,
        '',
        '  Nothing faked who is logged in, so the app sent itself to sign-in. ' +
          'Add a logged-in user to the mocks in sherlo.scenes.ts.',
        '',
      ];

    case 'play-target-missing':
      return [
        `${chalk.red('✖')}  ${chalk.bold(state.sceneId)} reached ${route(
          state.route
        )}, and its play stopped`,
        ...state.done.map((step) => chalk.dim(`   ${playStep(step)}`)),
        '',
        `  ${playStep(state.missing)} found no view with that testID within ${
          state.limitMs / 1000
        }s.`,
        '',
      ];

    case 'scene':
      return [
        `${chalk.green('✔')}  ${chalk.bold(state.sceneId)} captured, the way a test run records it`,
        chalk.dim(
          `   booted fresh in ${seconds(state.bootMs)} · reached ${route(
            state.reached.route
          )} in ${seconds(state.reached.ms)}`
        ),
        ...state.play.map((step) => chalk.dim(`   played ${playStep(step)}`)),
        chalk.dim(
          `   settled in ${seconds(state.settled.ms)} over ${state.settled.frames} frames · testing mode`
        ),
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

/** `tap chat-header-menu` - one play step, the way the scene file spells its verb. */
export function playStep(step: PlayStep): string {
  return `tap ${step.tap}`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * The scenes offered back when the id was wrong: the few nearest to what was typed, by edit
 * distance, so a typo finds its target and a different screen's scenes stay out of the way.
 */
export function closestScenes(typed: string, known: string[]): string[] {
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
