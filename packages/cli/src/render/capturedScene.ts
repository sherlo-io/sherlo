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
  errorLine,
  stillRealLines,
  treeLines,
  renderCapturedStory,
  seconds,
  settledLine,
  unansweredLines,
} from './capturedStory';
import type { CapturedView } from './capturedStory';
import { moreLines } from './moreLines';
import type { AnswerFinding, LikelyCause, UnansweredRequest } from '../seams/readAppAnswer';

/** What the app threw, ran as real code and left unanswered, as the story's record keeps them; each only when there is any. */
export type SceneLeft = {
  threw?: { name: string; message: string };
  stillReal?: string[];
  unanswered?: UnansweredRequest[];
  /** The ready view showed after step `atStep` of `of`, before the last one. */
  readyTooEarly?: { atStep: number; of: number };
  /** What the SDK found wrong in the faked GraphQL answers of the scene. */
  answerFindings?: AnswerFinding[];
  /** The distinct errors the app logged during the scene, counted and capped, as the app listed them. */
  loggedErrors?: { messages: { message: string; times: number }[]; moreLeftOut: number };
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
  const lines = sceneLines(state);
  if (!picture) return lines;

  return [...lines.slice(0, -1), ...pictureLines(state, picture), ''];
}

/** What `--png` came to: the saved path under a captured scene, the save's error, or that no scene was captured. */
function pictureLines(state: CapturedScene, picture: ScenePicture): string[] {
  if (state.kind !== 'scene') return [chalk.dim('No picture saved: the scene was not captured')];

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
        ...(state.threw
          ? [errorLine(state.threw)]
          : [
              '  Nothing faked who is logged in, so the app sent itself to sign-in. ' +
                "Add a logged-in user to the scene's mocks.",
            ]),
        ...(state.discover && state.likelyCause ? likelyCauseLines(state.likelyCause) : []),
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
  return [
    ...(left.discover || !hasCause ? [] : stillRealLines(stillReal)),
    ...(left.discover ? discoverLines(left) : unansweredLines(unanswered)),
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

/** The rule that answers a request, with its body left to fill in; a GraphQL request is matched by its operation name. */
function ruleOf({ method, url, operation }: UnansweredRequest): string {
  const matcher = operation ? `operationName: ${quoted(operation)}` : `url: ${quoted(url)}`;
  return `mockRequest({ method: ${quoted(method)}, ${matcher} }, { body: /* fill in */ })`;
}

/** What the app knows of a request's body, after the rule: its content type and masked excerpt, on one line. */
function requestNote({ contentType, bodyExcerpt }: UnansweredRequest): string {
  const parts = [
    ...(contentType ? [contentType] : []),
    ...(bodyExcerpt ? [`body ${bodyExcerpt.replace(/\s+/g, ' ')}`] : []),
  ];
  return parts.length > 0 ? chalk.dim(`  // ${parts.join(', ')}`) : '';
}

function quoted(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** One finding about a mock GraphQL answer, as the app listed it. */
function findingLine({ kind, operation, path, expected }: AnswerFinding): string {
  const where = `${operation ?? 'an operation'}${path ? ` at ${path}` : ''}`;
  const want = expected ? ` (expected ${expected})` : '';
  switch (kind) {
    case 'field-missing':
      return `  ${where}: the mock answer has no such field${want}`;
    case 'typename-missing':
      return `  ${where}: the mock answer has no __typename${want}`;
    case 'typename-matches-no-fragment':
      return `  ${where}: its __typename matches no fragment of the query${want}`;
    case 'no-query-text':
      return `  ${operation ?? 'a request'}: not checked, the request sent no query text`;
  }
}

/** Why a scene that never got ready likely did not, in the words the record's causes map to. */
function likelyCauseLines(causes: LikelyCause): string[] {
  const words = causes.map((cause) =>
    cause === 'unanswered-requests' ? 'requests with no mock' : 'errors the app logged'
  );
  return [`  Likely cause: ${words.join(' and ')}.`];
}

/** The errors the app logged during the scene, in the content's words; nothing when it logged none. */
function loggedErrorLines(logged: SceneLeft['loggedErrors']): string[] {
  if (!logged || logged.messages.length === 0) return [];
  const count = logged.messages.length + logged.moreLeftOut;
  return [
    '',
    `The app logged ${count === 1 ? '1 different error message' : `${count} different error messages`} during this scene:`,
    ...logged.messages.map(({ message, times }) =>
      times > 1 ? `  ${message} (logged ${times} times)` : `  ${message}`
    ),
    ...moreLines(logged.moreLeftOut),
  ];
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

/** `tap chat-header-menu`, `long-press testID "row"` or `open feeld://chat-list` - one play step, named for the capture. */
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
