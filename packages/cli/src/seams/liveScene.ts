/**
 * THE LIVE SCENE - the half of `sherlo capture --scene` and `sherlo open --scene` that reaches a
 * real device: it launches the app fresh on the scene, then asks the bundler's line for the record.
 *
 * The launch carries the scene's id (`-sherloCapture <id>` on iOS, `--es sherloCapture <id>` on
 * Android), so the app boots once, already in capture mode, on the scene. The command that calls
 * this has already made the device clean (`prepareCleanDevice`) and puts it back; this module never
 * does either. The record comes back down the same line a story's does, and Sherlo's own log
 * lines from the app are drained from the line's feed after it.
 */
import type { SceneEnding, PlayStep, PlayMissing } from '../render/capturedScene';
import { drainAppLog, keepStrings, readAppLog } from './appLog';
import { readAppError } from './appError';
import { readBundleFailure } from './bundleFailure';
import { askTheBundlerLine, STABILIZATION_SETTINGS } from './bundlerLine';
import { readCapturedView } from './capturedViewReader';
import { isTarget } from './deviceState';
import type { NoTarget, PhoneFound, SceneTarget } from './deviceState';
import { launchFresh } from './launchScene';
import { keptLeft, readLikelyCause } from './readAppAnswer';
import { endingOfStillScreen, STILL_LIMIT, waitForStillScreen } from './stillScreen';
import type { StillLimit } from './stillScreen';

/** How long the app has to boot, play the scene and settle before the command gives up on it. */
const SCENE_PATIENCE_MS = 120_000;

/** How long the launched app has to say hello on the line before the command calls it absent. */
const APP_HELLO_PATIENCE_MS = 60_000;

/** How long to wait between asks while the launched app has not said hello yet. */
const HELLO_RETRY_MS = 1000;

/**
 * What a scene on an app running old code is told: the reason, and the step that loads the code the
 * bundler serves now (the app is launched fresh on iOS and Android alike, so it is the bundler it
 * needs to be pointed at).
 */
export const OLD_CODE_DETAIL =
  'The app runs the code built into it, not the code your bundler serves now, so a picture of it ' +
  'would show old screens. Load the current code: open the app from the bundler (press r in the ' +
  "bundler's terminal, or shake the phone and choose Reload), then capture again.";

/**
 * A capture that found no app, and why: the phone had no target, the app was not on it, the line
 * broke (`detail` is the line's own account), nothing answered in time, or the launched app never
 * said hello.
 */
export type NoApp = {
  kind: 'no-app';
  why:
    | 'no-phone'
    | 'several-phones'
    | 'no-app-id'
    | 'not-installed'
    | 'line-broke'
    | 'gave-up-waiting'
    | 'never-said-hello'
    | 'old-code';
  detail?: string;
  /** For the causes of no target: every running phone, with its app id and whether it has the app. */
  found?: PhoneFound[];
};

/** What the app answered about the scene the command asked it to boot fresh on and capture. */
export type SceneCaptureResult = (
  | { kind: 'no-bundler' }
  | NoApp
  | SceneEnding
  | IncompleteScene
) & {
  /** Sherlo's own log lines from the app since it booted, drained from the bundler's feed after the answer. */
  logs?: string[];
};

/** A scene that came up and kept its picture, and had a request refused: it is not a complete one. */
export type IncompleteScene = Omit<Extract<SceneEnding, { kind: 'scene' }>, 'kind'> & {
  kind: 'incomplete';
};

/** What a scene capture is asked: where, on what, and whether it only lists the requests no mock answers. */
export type SceneCaptureParams = {
  sceneId: string;
  port: number;
  settings: typeof STABILIZATION_SETTINGS;
  /** The device and app the scene launches on, or the cause of there being none. */
  target: SceneTarget | NoTarget;
  /** Hold the requests no rule names and list them (`-sherloDiscover YES`, `--ez sherloDiscover true`). */
  discover?: boolean;
  /** How long the screen may sit still before the scene ends without the app's answer. */
  onStill?: StillLimit;
};

/**
 * Launch the app fresh on `sceneId`, wait for it to play the scene, and answer with its record.
 * Every way of not getting one is a named ending, never a thrown error. A screen that sits still
 * for the `onStill` limit ends the scene before the app's own patience runs out.
 */
export async function captureLiveScene(params: SceneCaptureParams): Promise<SceneCaptureResult> {
  const { sceneId, port, settings, target, discover, onStill = STILL_LIMIT } = params;
  if (!isTarget(target)) return { kind: 'no-app', why: target.cause, found: target.found };

  const launchedAt = await launchFresh(target, sceneId, port, discover);

  const helloDeadline = launchedAt + APP_HELLO_PATIENCE_MS;
  // The first line the app logs is the first sign its JavaScript runs: until then the screen is the
  // bundler's loading screen, not the scene. Each read empties the feed, so the lines are kept here.
  const lines: string[] = [];
  const hasLoggedYet = async () => {
    if (lines.length === 0) lines.push(...(await drainAppLog(port)));
    return lines.length > 0;
  };
  for (;;) {
    const stopWatching = new AbortController();
    const asked = askTheBundlerLine({
      port,
      // Asked as a scene, so the line hands the app a scene to walk, never a story; and of the app
      // launched now, never one an earlier capture left on the line.
      question: { action: 'captureStory', sceneId, settings, launchedAt },
      patienceMs: SCENE_PATIENCE_MS,
      giveUp: stopWatching.signal,
    });
    const stillScreen = waitForStillScreen(
      target.device,
      onStill,
      stopWatching.signal,
      hasLoggedYet
    );
    const first = await Promise.race([
      asked.then((answer) => ({ answer })),
      // A phone that gives no look says nothing: the app's answer is what is waited for.
      stillScreen.then((still) => (still ? { still } : new Promise<never>(() => {}))),
    ]);
    stopWatching.abort();
    if ('still' in first) {
      const logs = [...lines, ...(await drainAppLog(port))];
      const ending = endingOfStillScreen(sceneId, first.still);
      return logs.length > 0 ? { ...ending, logs } : ending;
    }
    const { answer } = first;

    if (answer.kind === 'nothing-on-the-port') return { kind: 'no-bundler' };
    if (answer.kind === 'old-code') {
      // The app was refused before it walked the scene, so no picture was taken of it.
      return withStageLines(
        { kind: 'no-app', why: 'old-code', detail: OLD_CODE_DETAIL },
        port,
        lines
      );
    }
    if (answer.kind === 'not-in-sherlos-words') {
      // The feed is read on its own question: it often still answers when the capture's did not.
      return withStageLines(
        { kind: 'no-app', why: 'line-broke', detail: answer.detail },
        port,
        lines
      );
    }
    if (answer.kind === 'gave-up-waiting') {
      // The line counts each time the app took the instruction and started over: no picture came
      // because the app kept starting over, which is not the same as no app.
      const { logs: lastLines, restarts } = await readAppLog(port);
      const logs = [...lines, ...lastLines];
      const ending: NoApp | SceneEnding =
        restarts > 0
          ? { kind: 'restarted-mid-capture', sceneId, restarts }
          : { kind: 'no-app', why: 'gave-up-waiting' };
      return logs.length > 0 ? { ...ending, logs } : ending;
    }

    const read = readSceneAnswer(answer.reply, sceneId);
    // A discover capture holds the requests it lists, so none of them is a refusal that spoils it.
    const ending = discover ? read : incompleteIfRefused(read);
    // The relay says no app has come yet until the launched one says hello: ask again.
    if (ending.kind === 'no-app' && Date.now() < helloDeadline) {
      await new Promise((resolve) => setTimeout(resolve, HELLO_RETRY_MS));
      continue;
    }

    if (ending.kind === 'no-app') {
      return withStageLines({ kind: 'no-app', why: 'never-said-hello' }, port, lines);
    }

    const logs = [...lines, ...(await drainAppLog(port))];
    return logs.length > 0 ? { ...ending, logs } : ending;
  }
}

/**
 * A no-app ending with the lines the app logged before it went quiet, so the last stage it reached
 * can be read. They ride in the --json reply only: the terminal words for no app stay as signed.
 */
async function withStageLines(
  ending: NoApp,
  port: number,
  linesBefore: string[]
): Promise<NoApp & { logs?: string[] }> {
  const logs = [...linesBefore, ...(await drainAppLog(port))];
  return logs.length > 0 ? { ...ending, logs } : ending;
}

/** A scene that came up with a request refused by a rule ends as incomplete, keeping all it has. */
export function incompleteIfRefused<Ending extends SceneCaptureResult | { kind: 'no-app' }>(
  ending: Ending
): Ending | IncompleteScene {
  const refused = ending.kind === 'scene' && ending.unanswered?.some(({ rule }) => rule);
  return refused ? { ...ending, kind: 'incomplete' } : ending;
}

/* ========================================================================== */

/** The test ids a never-reached scene saw on screen, as the app listed them; nothing when it listed none. */
function keptSeen(said: unknown): { seen?: { testIDs: string[]; more: number } } {
  const seen = said as { testIDs?: unknown; more?: unknown } | null | undefined;
  if (!Array.isArray(seen?.testIDs)) return {};
  const more = typeof seen.more === 'number' ? seen.more : 0;
  return { seen: { testIDs: keepStrings(seen.testIDs), more } };
}

/** What the line said about the scene it was asked for, as one named ending. */
export function readSceneAnswer(said: unknown, sceneId: string): SceneEnding | { kind: 'no-app' } {
  const answer = said as Record<string, unknown> | null | undefined;

  if (answer?.kind === 'no-such-story') {
    return { kind: 'no-such-scene', sceneId, known: keepStrings(answer.known) };
  }

  // The bundler could not build the code the launched app asked for: no app will come, so this ends
  // the capture at once instead of waiting out the app's hello.
  if (answer?.kind === 'bundle-does-not-build') {
    const failure = readBundleFailure(answer.failure);
    if (failure) return { kind: 'bundle-does-not-build', sceneId, failure };
  }

  // The core sends "crashed" for a scene only from the catch around its capture, after the app booted.
  if (answer?.kind === 'crashed') {
    const error = readAppError(answer.error);
    return {
      kind: 'crashed-mid-capture',
      sceneId,
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          ...(error.topFrames && { topFrames: error.topFrames }),
        },
      }),
      ...keptLeft(answer),
    };
  }

  if (answer?.kind === 'never-reached') {
    const likelyCause = readLikelyCause(answer.likelyCause);
    return {
      kind: 'never-reached',
      sceneId,
      ready: typeof answer.ready === 'string' ? answer.ready : '',
      stayedOn: keepStrings(answer.stayedOn),
      ...keptSeen(answer.seen),
      ...(likelyCause && { likelyCause }),
      ...keptLeft(answer),
    };
  }

  if (answer?.kind === 'play-target-missing') {
    return {
      kind: 'play-target-missing',
      sceneId,
      route: keepStrings(answer.route),
      done: playSteps(answer.done),
      missing: playMissing(answer.missing as PlayStepAnswer | undefined) ?? { tap: '' },
      limitMs: typeof answer.limitMs === 'number' ? answer.limitMs : 0,
      ...keptLeft(answer),
    };
  }

  // The SDK's own word for a screen that was ready and kept moving: the picture is the one taken at
  // the limit, the views still changing and the fields still waiting for focus are named.
  if (answer?.kind === 'never-settled') {
    const changing = keepStrings(answer.changing);
    const unfocused = keepStrings(answer.unfocused);
    return {
      kind: 'never-settled',
      sceneId,
      seconds: STABILIZATION_SETTINGS.timeoutMs / 1000,
      reached: { route: keepStrings(answer.route), ms: 0 },
      ...(changing.length > 0 && { changing }),
      ...(unfocused.length > 0 && { unfocused }),
      tree: readCapturedView(answer.tree),
      ...keptLeft(answer),
    };
  }

  if (answer?.kind === 'scene') {
    const reached = answer.reached as { route?: unknown; ms?: unknown } | undefined;
    const settled = answer.settled as { ms?: unknown; frames?: unknown } | string | undefined;
    if (typeof settled !== 'object' || typeof settled?.ms !== 'number') {
      // A scene that names the view it waited for never got ready: it ends in the signed "never got ready" words.
      if (typeof answer.ready === 'string') {
        return {
          kind: 'never-reached',
          sceneId,
          ready: answer.ready,
          stayedOn: keepStrings(reached?.route),
          ...keptLeft(answer),
        };
      }
      // A scene whose screen never held still got ready and was read: it keeps its tree, and says so.
      const changing = keepStrings(answer.changing);
      return {
        kind: 'never-settled',
        sceneId,
        seconds: STABILIZATION_SETTINGS.timeoutMs / 1000,
        reached: {
          route: keepStrings(reached?.route),
          ms: typeof reached?.ms === 'number' ? reached.ms : 0,
        },
        ...(changing.length > 0 && { changing }),
        tree: readCapturedView(answer.tree),
        ...keptLeft(answer),
      };
    }
    return {
      kind: 'scene',
      sceneId,
      bootMs: typeof answer.bootMs === 'number' ? answer.bootMs : 0,
      reached: {
        route: keepStrings(reached?.route),
        ms: typeof reached?.ms === 'number' ? reached.ms : 0,
      },
      play: playSteps(answer.play),
      settled: { ms: settled.ms, frames: typeof settled.frames === 'number' ? settled.frames : 0 },
      ...(typeof answer.density === 'number' && { density: answer.density }),
      ...(typeof answer.fontScale === 'number' && { fontScale: answer.fontScale }),
      tree: readCapturedView(answer.tree),
      ...keptLeft(answer),
    };
  }

  return { kind: 'no-app' };
}

function playSteps(value: unknown): PlayStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((step: PlayStepAnswer): PlayStep[] => {
    if (typeof step?.open === 'string') return [{ open: step.open }];
    const played = playMissing(step);
    return played ? [played] : [];
  });
}

type PlayStepAnswer = {
  tap?: unknown;
  longPress?: unknown;
  type?: unknown;
  swipe?: unknown;
  direction?: unknown;
  open?: unknown;
};

/** The step as the app answered it, when it is a tap, a long-press, a typing or a swipe. */
function playMissing(step: PlayStepAnswer | undefined): PlayMissing | undefined {
  if (typeof step?.tap === 'string') return { tap: step.tap };
  if (typeof step?.longPress === 'string') return { longPress: step.longPress };
  if (typeof step?.type === 'string') return { type: step.type };
  const { swipe, direction } = step ?? {};
  if (
    typeof swipe === 'string' &&
    (direction === 'left' || direction === 'right' || direction === 'up' || direction === 'down')
  ) {
    return { swipe, direction };
  }
  return undefined;
}
