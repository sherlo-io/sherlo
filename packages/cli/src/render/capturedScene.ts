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
import {
  NOTHING_BEFORE_DEATH,
  bundleFailureLines,
  errorLine,
  stillRealLines,
  treeLines,
  renderCapturedStory,
  seconds,
  settledLine,
  unansweredLines,
} from './capturedStory';
import type { BundleBuildFailure, CapturedView } from './capturedStory';
import { ruleOf } from './mockRuleLine';
import { refusalLines } from './refusalExplanation';
import {
  answerFindingLines,
  blankScreenLines,
  endedEarlyLines,
  explainsTheStop,
  findingLine,
  letThroughLines,
  loggedErrorLines,
  mockNotAppliedLines,
  partialFieldLines,
  phoneNotAppliedLines,
  screenLines,
  sinceLastRunLines,
  threwLines,
} from './sceneDiagnosis';
import type { AnswerFinding, LikelyCause, UnansweredRequest } from '../seams/readAppAnswer';

/** What the app threw, ran as real code and left unanswered, as the story's record keeps them; each only when there is any. */
export type SceneLeft = {
  /** What the app threw; `file` and `line` are where, when the app's stack said. */
  threw?: { name: string; message: string; file?: string; line?: number };
  stillReal?: string[];
  unanswered?: UnansweredRequest[];
  /** The ready view showed after step `atStep` of `of`, before the last one. */
  readyTooEarly?: { atStep: number; of: number };
  /** What the SDK found wrong in the faked GraphQL answers of the scene. */
  answerFindings?: AnswerFinding[];
  /** The distinct errors the app logged during the scene, counted and capped, as the app listed them. */
  loggedErrors?: { messages: { message: string; times: number }[]; moreLeftOut: number };
  /** The words on the app's screen when the capture stopped, and how many views it drew. */
  screen?: { words: string[]; views: number };
  /** The capture gave up `afterMs` in, because the app was still on a consent or sign-in screen. */
  endedEarly?: { afterMs: number; stuckOn: 'consent' | 'sign-in'; button?: string };
  /** The module fakes the scene declared and the app never used. */
  mockNotApplied?: { module: string; why?: 'bundler-had-not-seen-it' }[];
  /** The shape a fake gave a field, against the shape the app reads it as. */
  crashCause?: { dataPath: string; gave: string; appExpects: string };
  /** The requests a rule of the scene let reach the real network. */
  letThrough?: UnansweredRequest[];
  /** How the last run of the same scene ended, to say what changed. */
  lastRun?: {
    ending: 'captured' | 'never-settled' | 'never-reached';
    route: string[];
    refused: number;
  };
  /** The phone settings the scene asked for and Sherlo could not write. */
  phoneNotApplied?: {
    setting: string;
    wanted: string;
    why: 'app-not-installed' | 'phone-refused';
  }[];
};

/**
 * One step of a scene's `play`, as the scene file wrote it: a tap, a long-press, a typing or a
 * swipe on a view (named, never the typed text), or one of the app's own links.
 */
export type PlayStep =
  | { tap: string }
  | { longPress: string }
  | { type: string }
  | { swipe: string; direction: 'left' | 'right' | 'up' | 'down' }
  | { open: string };

/** The step whose view never showed: any step but a link. */
export type PlayMissing = Exclude<PlayStep, { open: string }>;

/** How a scene run ended, without the bundler's two refusals, which carry a port. */
export type SceneEnding =
  | { kind: 'no-such-scene'; sceneId: string; known: string[] }
  /** The bundler could not build the app's code, so the launched app never started. */
  | { kind: 'bundle-does-not-build'; sceneId: string; failure: BundleBuildFailure }
  /** The app's own JS threw while it started, before any scene could be put on it. */
  | {
      kind: 'crashed-at-boot';
      sceneId: string;
      error: { name: string; message: string; file: string; line: number };
    }
  /** The app booted and took the capture, and the capture threw; `error` is what the app said, when it said. */
  | ({
      kind: 'crashed-mid-capture';
      sceneId: string;
      error?: { name: string; message: string };
    } & SceneLeft)
  /** The app booted, and the scene's ready view never showed; `stayedOn` is the route the app was on. */
  | ({
      kind: 'never-reached';
      sceneId: string;
      ready: string;
      stayedOn: string[];
      /** The test ids on screen when the wait gave up, for the json reply only. */
      seen?: { testIDs: string[]; more: number };
      /** What the record points to as the likely cause. */
      likelyCause?: LikelyCause;
    } & SceneLeft)
  /** A play step found no view with its testID within its limit; `route` is where the app stood. */
  | ({
      kind: 'play-target-missing';
      sceneId: string;
      route: string[];
      /** The steps done before the one that found nothing. */
      done: PlayStep[];
      missing: PlayMissing;
      limitMs: number;
    } & SceneLeft)
  /** The scene got ready and was read, but its screen never stopped changing within `seconds`. */
  | ({
      kind: 'never-settled';
      sceneId: string;
      seconds: number;
      reached: { route: string[]; ms: number };
      /** The views still changing when the stabilization gave up, by the tag the tree draws each by. */
      changing?: string[];
      tree: CapturedView;
    } & SceneLeft)
  /** The app took the capture and started over `restarts` times, and no picture came of it. */
  | { kind: 'restarted-mid-capture'; sceneId: string; restarts: number }
  /** The record. `bootMs` is the fresh boot; `reached.ms` is from there to the ready view showing. */
  | ({
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
    } & SceneLeft);

/** How a run of `sherlo capture --scene` ended, as the screen needs it. */
export type CapturedScene = (
  | { kind: 'no-bundler'; port: number }
  | { kind: 'no-app'; port: number }
  | SceneEnding
) & {
  /** The scene was a discover capture: its unanswered requests are the result, listed as rules. */
  discover?: true;
};

/** The picture `--png` asked for: where it goes, and why saving it failed when it did. */
export type ScenePicture = { path: string; error?: string };

/**
 * Every line `sherlo capture --scene` prints, in order. With `--png`, the last line before the
 * closing blank says whether the picture was saved: one place that all endings reach.
 */
export function renderCapturedScene(state: CapturedScene, picture?: ScenePicture): string[] {
  const lines = [
    ...phoneNotAppliedLines('phoneNotApplied' in state ? state : {}),
    ...sceneLines(state),
  ];
  if (!picture) return lines;

  return [...lines.slice(0, -1), ...pictureLines(state, picture), ''];
}

/**
 * What `--png` came to: the saved path under a captured scene, or under a scene that stopped with
 * its screen read (the picture shows where it stopped), the save's error, or that no scene was captured.
 */
function pictureLines(state: CapturedScene, picture: ScenePicture): string[] {
  const stoppedWithScreen = state.kind === 'never-reached' && state.screen !== undefined;
  if (state.kind !== 'scene' && state.kind !== 'never-settled' && !stoppedWithScreen) {
    return [chalk.dim('No picture saved: the scene was not captured')];
  }

  return picture.error
    ? [chalk.dim(`No picture saved: ${picture.error}`)]
    : [chalk.dim(`Picture saved to ${picture.path}`)];
}

function sceneLines(state: CapturedScene): string[] {
  switch (state.kind) {
    case 'no-bundler':
    case 'no-app':
      return renderCapturedStory(state);

    case 'no-such-scene':
      return noSuchSceneLines(state.sceneId, state.known);

    case 'bundle-does-not-build':
      return bundleFailureLines(state.failure);

    case 'crashed-at-boot': {
      const { name, message, file, line } = state.error;
      return [
        `${chalk.red('✖')}  ${chalk.bold(state.sceneId)} never booted - the app's own code threw at start`,
        '',
        `  ${name}: ${message} (${file}:${line})`,
        '',
      ];
    }

    case 'crashed-mid-capture':
      return [
        `${chalk.red('✖')}  ${chalk.bold(
          state.sceneId
        )} failed after it booted - the capture stopped before it finished`,
        '',
        ...(state.error ? [errorLine(state.error)] : [chalk.dim(NOTHING_BEFORE_DEATH)]),
        ...leftLines(state),
        '',
      ];

    case 'never-reached':
      return [
        `${chalk.red('✖')}  ${chalk.bold(state.sceneId)} never got ready - no view ${
          state.ready
        } showed, and the app stayed on ${route(state.stayedOn)}`,
        '',
        ...sinceLastRunLines(state.lastRun, {
          ending: 'never-reached',
          route: state.stayedOn,
          refused: state.unanswered?.length ?? 0,
        }),
        ...screenLines(state.screen),
        ...(state.endedEarly ? ['', ...endedEarlyLines(state.endedEarly)] : []),
        ...threwLines(state.threw, state.crashCause),
        ...(explainsTheStop(state)
          ? []
          : [
              '  Nothing faked who is logged in, so the app sent itself to sign-in. ' +
                "Add a logged-in user to the scene's mocks.",
            ]),
        ...blankScreenLines(state.sceneId, state),
        ...(state.discover && state.likelyCause ? likelyCauseLines(state.likelyCause) : []),
        ...leftLines(state),
        '',
      ];

    case 'never-settled':
      return [
        `${chalk.yellow('◦')}  ${chalk.bold(state.sceneId)} got ready but never stopped changing within ${
          state.seconds
        }s`,
        chalk.dim('   A test run of this scene would stop at the same limit. What it read then:'),
        ...(state.changing && state.changing.length > 0
          ? [chalk.dim(`   Still changing: ${state.changing.join(', ')}`)]
          : []),
        '',
        ...treeLines(state.tree),
        ...(state.threw ? ['', errorLine(state.threw)] : []),
        ...leftLines(state),
        '',
      ];

    case 'play-target-missing':
      return [
        `${chalk.red('✖')}  ${chalk.bold(state.sceneId)} stopped on ${route(
          state.route
        )} - its play could not go on`,
        ...state.done.map((step) => chalk.dim(`   ${playStep(step)}`)),
        '',
        `  ${missedStep(state.missing)} within ${state.limitMs / 1000}s.`,
        ...(state.threw ? ['', errorLine(state.threw)] : []),
        ...leftLines(state),
        '',
      ];

    case 'restarted-mid-capture':
      return [
        `${chalk.red('✖')}  Scene ${chalk.bold(state.sceneId)} never finished: the app started over ${
          state.restarts
        } ${state.restarts === 1 ? 'time' : 'times'} while Sherlo captured it`,
        '',
        '  Add --json or --logs to see the log lines of each restart and what the bundler saw before it.',
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
        ...(state.threw ? ['', errorLine(state.threw)] : []),
        ...leftLines(state),
        '',
      ];
  }
}

/** The requests no mock answered, and the modules that ran real beside an error or an unanswered request; nothing when there are none. */
function leftLines(left: SceneLeft & { discover?: true }): string[] {
  const { stillReal, unanswered, loggedErrors } = left;
  const hasCause = Boolean(left.threw) || (unanswered ?? []).length > 0;
  const modulesNamed = (left.mockNotApplied ?? []).length > 0;
  return [
    ...(left.discover || !hasCause || modulesNamed ? [] : stillRealLines(stillReal)),
    ...(left.discover
      ? discoverLines(left)
      : (refusalLines(unanswered) ?? unansweredLines(unanswered))),
    ...mockNotAppliedLines(left.mockNotApplied),
    ...letThroughLines(left.letThrough),
    ...(left.discover ? [] : answerFindingLines(left.answerFindings)),
    ...partialFieldLines(loggedErrors),
    ...loggedErrorLines(loggedErrors),
  ];
}

/**
 * A discover capture's result: each request no mock answered as the rule that would answer it, once
 * and in the order the app asked, then the early ready view and the findings about mock answers.
 */
function discoverLines({ unanswered, readyTooEarly, answerFindings }: SceneLeft): string[] {
  const rules = new Map<string, UnansweredRequest>();
  for (const request of unanswered ?? []) {
    const rule = ruleOf(request);
    if (!rules.has(rule)) rules.set(rule, request);
  }
  return [
    ...(rules.size === 0
      ? ['', 'No request went without a mock.']
      : [
          '',
          `${chalk.yellow('◦')}  ${rules.size} ${rules.size === 1 ? 'request' : 'requests'} had no mock. Paste ${rules.size === 1 ? 'this rule' : 'these rules'} into the scene file:`,
          ...[...rules].map(([rule, request]) => `     ${rule}${requestNote(request)}`),
          '',
          '  Paste the rules, fill in each body, then capture again without --discover.',
        ]),
    ...(readyTooEarly
      ? [
          '',
          `  The ready view showed after step ${readyTooEarly.atStep} of ${readyTooEarly.of}, before the last step of the play ran.`,
        ]
      : []),
    ...(answerFindings && answerFindings.length > 0
      ? ['', 'Mock answers the app could not use:', ...answerFindings.map(findingLine)]
      : []),
  ];
}

/** What the app knows of a request's body, after the rule: its content type and masked excerpt, on one line. */
function requestNote({ contentType, bodyExcerpt }: UnansweredRequest): string {
  const parts = [
    ...(contentType ? [contentType] : []),
    ...(bodyExcerpt ? [`body ${bodyExcerpt.replace(/\s+/g, ' ')}`] : []),
  ];
  return parts.length > 0 ? chalk.dim(`  // ${parts.join(', ')}`) : '';
}

/** Why a scene that never got ready likely did not, in the words the record's causes map to. */
function likelyCauseLines(causes: LikelyCause): string[] {
  const words = causes.map((cause) =>
    cause === 'unanswered-requests' ? 'requests with no mock' : 'errors the app logged'
  );
  return [`  Likely cause: ${words.join(' and ')}.`];
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
function missedStep(step: PlayMissing): string {
  const [verb, target] = verbAndTarget(step);
  const [, by, name] = TEXT_OR_LABEL_TARGET.exec(target) ?? [];
  return `${verb} ${by ? name : target} found no view with that ${by ?? 'testID'}`;
}

/** A target the app spells `text "Row"` or `label "Row"`; any other is a bare testID. */
const TEXT_OR_LABEL_TARGET = /^(text|label) "([\s\S]*)"$/;

function verbAndTarget(step: PlayMissing): [string, string] {
  if ('tap' in step) return ['tap', step.tap];
  if ('longPress' in step) return ['long-press', step.longPress];
  if ('type' in step) return ['type', step.type];
  return [`swipe ${step.direction}`, step.swipe];
}

/** `tap chat-header-menu`, `long-press testID "row"` or `open myapp://chat-list` - one play step, named for the capture. */
export function playStep(step: PlayStep): string {
  if ('open' in step) return `open ${step.open}`;
  if ('tap' in step) return `tap ${step.tap}`;
  const [verb, target] = verbAndTarget(step);
  return `${verb} ${TEXT_OR_LABEL_TARGET.test(target) ? target : `testID "${target}"`}`;
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
