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
import type { SceneEnding, SceneLeft, PlayStep, PlayMissing } from '../render/capturedScene';
import { drainAppLog, keepStrings, readAppLog } from './appLog';
import { readAppError } from './appError';
import { askTheBundlerLine, STABILIZATION_SETTINGS } from './bundlerLine';
import { readCapturedView } from './capturedViewReader';
import { deviceState, isTarget } from './deviceState';
import type { NoTarget, PhoneFound, SceneTarget } from './deviceState';
import {
  androidDevelopmentLauncherLink,
  pointAndroidAppAtBundler,
  pointIosAppAtBundler,
  iosDevelopmentLauncherLink,
  prepareAndroidDevMenuForCapture,
} from './developmentLauncher';
import {
  readAnswerFindings,
  readLikelyCause,
  readLoggedErrors,
  readReadyTooEarly,
  readStrings,
  readUnanswered,
} from './readAppAnswer';

/** How long the app has to boot, play the scene and settle before the command gives up on it. */
const SCENE_PATIENCE_MS = 120_000;

/** How long the launched app has to say hello on the line before the command calls it absent. */
const APP_HELLO_PATIENCE_MS = 60_000;

/** How long to wait between asks while the launched app has not said hello yet. */
const HELLO_RETRY_MS = 1000;

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
    | 'never-said-hello';
  detail?: string;
  /** For the causes of no target: every running phone, with its app id and whether it has the app. */
  found?: PhoneFound[];
};

/** What the app answered about the scene the command asked it to boot fresh on and capture. */
export type SceneCaptureResult = ({ kind: 'no-bundler' } | NoApp | SceneEnding) & {
  /** Sherlo's own log lines from the app since it booted, drained from the bundler's feed after the answer. */
  logs?: string[];
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
};

/**
 * Launch the app fresh on `sceneId`, wait for it to play the scene, and answer with its record.
 * Every way of not getting one is a named ending, never a thrown error.
 */
export async function captureLiveScene(params: SceneCaptureParams): Promise<SceneCaptureResult> {
  const { sceneId, port, settings, target, discover } = params;
  if (!isTarget(target)) return { kind: 'no-app', why: target.cause, found: target.found };

  const launchedAt = await launchFresh(target, sceneId, port, discover);

  const helloDeadline = launchedAt + APP_HELLO_PATIENCE_MS;
  for (;;) {
    const answer = await askTheBundlerLine({
      port,
      // Asked as a scene, so the line hands the app a scene to walk, never a story; and of the app
      // launched now, never one an earlier capture left on the line.
      question: { action: 'captureStory', sceneId, settings, launchedAt },
      patienceMs: SCENE_PATIENCE_MS,
    });

    if (answer.kind === 'nothing-on-the-port') return { kind: 'no-bundler' };
    if (answer.kind === 'not-in-sherlos-words') {
      // The feed is read on its own question: it often still answers when the capture's did not.
      return withStageLines({ kind: 'no-app', why: 'line-broke', detail: answer.detail }, port);
    }
    if (answer.kind === 'gave-up-waiting') {
      // The line counts each time the app took the instruction and started over: no picture came
      // because the app kept starting over, which is not the same as no app.
      const { logs, restarts } = await readAppLog(port);
      const ending: NoApp | SceneEnding =
        restarts > 0
          ? { kind: 'restarted-mid-capture', sceneId, restarts }
          : { kind: 'no-app', why: 'gave-up-waiting' };
      return logs.length > 0 ? { ...ending, logs } : ending;
    }

    const ending = readSceneAnswer(answer.reply, sceneId);
    // The relay says no app has come yet until the launched one says hello: ask again.
    if (ending.kind === 'no-app' && Date.now() < helloDeadline) {
      await new Promise((resolve) => setTimeout(resolve, HELLO_RETRY_MS));
      continue;
    }

    if (ending.kind === 'no-app') {
      return withStageLines({ kind: 'no-app', why: 'never-said-hello' }, port);
    }

    const logs = await drainAppLog(port);
    return logs.length > 0 ? { ...ending, logs } : ending;
  }
}

/**
 * A no-app ending with the lines the app logged before it went quiet, so the last stage it reached
 * can be read. They ride in the --json reply only: the terminal words for no app stay as signed.
 */
async function withStageLines(ending: NoApp, port: number): Promise<NoApp & { logs?: string[] }> {
  const logs = await drainAppLog(port);
  return logs.length > 0 ? { ...ending, logs } : ending;
}

/**
 * Empty the log feed of what an earlier scene left. Called once the old app is stopped and before
 * the new one starts, so no line is of the new launch; the feed keeps no time, so `launchedAt`
 * cannot do this for it. A line of the old app still in flight on the socket when it was stopped
 * is the one thing this cannot rule out.
 */
async function dropStaleLines(port: number): Promise<void> {
  await drainAppLog(port);
}

/**
 * Stop the app if it runs, then start it with the scene's id in the launch. Answers when the start
 * was asked, after the stop: the bundler runs on this machine, so the line reads the same clock.
 */
async function launchFresh(
  target: SceneTarget,
  sceneId: string,
  port: number,
  discover = false
): Promise<number> {
  const { device, app } = target;
  const run = deviceState().run;

  if (device.platform === 'ios') {
    await run('xcrun', ['simctl', 'terminate', device.udid, app.id]).catch(() => '');
    const link = await iosDevelopmentLauncherLink(run, device.udid, app.id, port);
    if (link) {
      // Mirrors sherlo-runner's ios launchApp.ts: the sheet's record is a user default of the app.
      // The menu stays closed at launch too (the clean device wipes that setting), and its floating
      // Tools button is off so it never covers the scene; the shake gesture and key commands still
      // open the menu.
      for (const [key, value] of [
        ['EXDevMenuIsOnboardingFinished', 'YES'],
        ['EXDevMenuShowsAtLaunch', 'NO'],
        ['EXDevMenuShowFloatingActionButton', 'NO'],
      ]) {
        await run('xcrun', [
          'simctl',
          'spawn',
          device.udid,
          'defaults',
          'write',
          app.id,
          key,
          '-bool',
          value,
        ]);
      }
    } else {
      await pointIosAppAtBundler(run, device.udid, app.id, port);
    }
    // expo-dev-launcher reads `--initialUrl <url>` from the process arguments at launch and opens
    // that link first (EXDevLauncherController `initialUrlFromProcessInfo`), so one launch carries
    // both the bundle's link and the scene's id. A simulator reaches the bundler on localhost.
    await dropStaleLines(port);
    const launchedAt = Date.now();
    await run('xcrun', [
      'simctl',
      'launch',
      device.udid,
      app.id,
      ...(link ? ['--initialUrl', link] : []),
      '-sherloCapture',
      sceneId,
      ...(discover ? ['-sherloDiscover', 'YES'] : []),
    ]);
    return launchedAt;
  }

  const adb = (...args: string[]) => run('adb', ['-s', device.serial, 'shell', ...args]);

  // An app names its own launcher activity, so ask the phone which one it is.
  const resolved = await adb(
    'cmd',
    'package',
    'resolve-activity',
    '--brief',
    '-a',
    'android.intent.action.MAIN',
    '-c',
    'android.intent.category.LAUNCHER',
    app.id
  );
  const component = resolved
    .split('\n')
    .map((line) => line.trim())
    .reverse()
    .find((line) => /^\S+\/\S+$/.test(line));
  if (!component) throw new Error(resolved.trim());

  await adb('am', 'force-stop', app.id).catch(() => '');
  const link = await androidDevelopmentLauncherLink(adb, app.id, port);
  if (link) {
    await prepareAndroidDevMenuForCapture(adb, app.id);
  } else {
    await pointAndroidAppAtBundler(adb, app.id, port);
  }
  // A clean phone has no last bundle for Expo's development launcher to reopen (the data is wiped
  // before each scene), and a plain app asks localhost: either way the phone's port must reach the bundler.
  await run('adb', ['-s', device.serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  await dropStaleLines(port);
  const launchedAt = Date.now();
  const started = await adb(
    'am',
    'start',
    '-n',
    component,
    ...(link
      ? ['-a', 'android.intent.action.VIEW', '-d', `'${link}'`]
      : ['-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER']),
    '--es',
    'sherloCapture',
    sceneId,
    ...(discover ? ['--ez', 'sherloDiscover', 'true'] : [])
  );
  // `adb shell am start` exits 0 even when the phone refuses, so its words are read here.
  if (/^Error:/m.test(started)) throw new Error(started.trim());
  return launchedAt;
}

/* ========================================================================== */

/** The test ids a never-reached scene saw on screen, as the app listed them; nothing when it listed none. */
function keptSeen(said: unknown): { seen?: { testIDs: string[]; more: number } } {
  const seen = said as { testIDs?: unknown; more?: unknown } | null | undefined;
  if (!Array.isArray(seen?.testIDs)) return {};
  const more = typeof seen.more === 'number' ? seen.more : 0;
  return { seen: { testIDs: keepStrings(seen.testIDs), more } };
}

/** What the scene threw, ran as real code and left unanswered, as the story's record reads them. */
function keptLeft(answer: Record<string, unknown>): SceneLeft {
  const threw = readAppError(answer.threw);
  const stillReal = readStrings(answer.stillReal);
  const unanswered = readUnanswered(answer.unanswered, true);
  const loggedErrors = readLoggedErrors(answer.loggedErrors);
  const readyTooEarly = readReadyTooEarly(answer.readyTooEarly);
  const answerFindings = readAnswerFindings(answer.answerFindings);
  return {
    ...(threw && { threw: { name: threw.name, message: threw.message } }),
    ...(stillReal && { stillReal }),
    ...(unanswered && { unanswered }),
    ...(readyTooEarly && { readyTooEarly }),
    ...(answerFindings && { answerFindings }),
    ...(loggedErrors && { loggedErrors }),
  };
}

/** What the line said about the scene it was asked for, as one named ending. */
export function readSceneAnswer(said: unknown, sceneId: string): SceneEnding | { kind: 'no-app' } {
  const answer = said as Record<string, unknown> | null | undefined;

  if (answer?.kind === 'no-such-story') {
    return { kind: 'no-such-scene', sceneId, known: keepStrings(answer.known) };
  }

  // The core sends "crashed" for a scene only from the catch around its capture, after the app booted.
  if (answer?.kind === 'crashed') {
    const error = readAppError(answer.error);
    return {
      kind: 'crashed-mid-capture',
      sceneId,
      ...(error && { error: { name: error.name, message: error.message } }),
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
