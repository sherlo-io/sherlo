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
import type { SceneEnding, PlayStep } from '../render/capturedScene';
import { drainAppLog, keepStrings } from './appLog';
import { readAppError } from './appError';
import { askTheBundlerLine } from './bundlerLine';
import { readCapturedView } from './capturedViewReader';
import { deviceState } from './deviceState';
import type { SceneTarget } from './deviceState';
import type { SceneCaptureResult, STABILIZATION_SETTINGS } from './captureSocket';

/** How long the app has to boot, play the scene and settle before the command gives up on it. */
const SCENE_PATIENCE_MS = 120_000;

/** How long the launched app has to say hello on the line before the command calls it absent. */
const APP_HELLO_PATIENCE_MS = 60_000;

/** How long to wait between asks while the launched app has not said hello yet. */
const HELLO_RETRY_MS = 1000;

/**
 * Launch the app fresh on `sceneId`, wait for it to play the scene, and answer with its record.
 * Every way of not getting one is a named ending, never a thrown error.
 */
export async function captureLiveScene(params: {
  sceneId: string;
  port: number;
  settings: typeof STABILIZATION_SETTINGS;
  target: SceneTarget | undefined;
}): Promise<SceneCaptureResult> {
  const { sceneId, port, settings, target } = params;
  if (!target) return { kind: 'no-app' };

  await launchFresh(target, sceneId);

  const helloDeadline = Date.now() + APP_HELLO_PATIENCE_MS;
  for (;;) {
    const answer = await askTheBundlerLine({
      port,
      question: { action: 'captureStory', storyId: sceneId, settings },
      patienceMs: SCENE_PATIENCE_MS,
    });

    if (answer.kind === 'nothing-on-the-port') return { kind: 'no-bundler' };
    if (answer.kind === 'not-in-sherlos-words' || answer.kind === 'gave-up-waiting') {
      return { kind: 'no-app' };
    }

    const ending = readSceneAnswer(answer.reply, sceneId);
    // The relay says no app has come yet until the launched one says hello: ask again.
    if (ending.kind === 'no-app' && Date.now() < helloDeadline) {
      await new Promise((resolve) => setTimeout(resolve, HELLO_RETRY_MS));
      continue;
    }

    const logs = await drainAppLog(port);
    return logs.length > 0 ? { ...ending, logs } : ending;
  }
}

/** Stop the app if it runs, then start it with the scene's id in the launch. */
async function launchFresh(target: SceneTarget, sceneId: string): Promise<void> {
  const { device, app } = target;
  const run = deviceState().run;

  if (device.platform === 'ios') {
    await run('xcrun', ['simctl', 'terminate', device.udid, app.id]).catch(() => '');
    await run('xcrun', ['simctl', 'launch', device.udid, app.id, '-sherloCapture', sceneId]);
    return;
  }

  await run('adb', ['-s', device.serial, 'shell', 'am', 'force-stop', app.id]).catch(() => '');
  await run('adb', [
    '-s',
    device.serial,
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.MAIN',
    '-c',
    'android.intent.category.LAUNCHER',
    '-p',
    app.id,
    '--es',
    'sherloCapture',
    sceneId,
  ]);
}

/* ========================================================================== */

/** What the line said about the scene it was asked for, as one named ending. */
export function readSceneAnswer(said: unknown, sceneId: string): SceneEnding | { kind: 'no-app' } {
  const answer = said as Record<string, unknown> | null | undefined;

  if (answer?.kind === 'no-such-story') {
    return { kind: 'no-such-scene', sceneId, known: keepStrings(answer.known) };
  }

  if (answer?.kind === 'crashed') {
    return { kind: 'crashed-at-boot', sceneId, error: bootError(answer.error) };
  }

  if (answer?.kind === 'never-reached') {
    return {
      kind: 'never-reached',
      sceneId,
      ready: typeof answer.ready === 'string' ? answer.ready : '',
      stayedOn: keepStrings(answer.stayedOn),
    };
  }

  if (answer?.kind === 'play-target-missing') {
    const missing = answer.missing as { tap?: unknown } | undefined;
    return {
      kind: 'play-target-missing',
      sceneId,
      route: keepStrings(answer.route),
      done: playSteps(answer.done),
      missing: { tap: typeof missing?.tap === 'string' ? missing.tap : '' },
      limitMs: typeof answer.limitMs === 'number' ? answer.limitMs : 0,
    };
  }

  if (answer?.kind === 'scene') {
    const reached = answer.reached as { route?: unknown; ms?: unknown } | undefined;
    const settled = answer.settled as { ms?: unknown; frames?: unknown } | string | undefined;
    // A scene that never settled did not get ready: it ends in the signed "never got ready" words.
    if (typeof settled !== 'object' || typeof settled?.ms !== 'number') {
      return {
        kind: 'never-reached',
        sceneId,
        ready: typeof answer.ready === 'string' ? answer.ready : '',
        stayedOn: keepStrings(reached?.route),
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
      tree: readCapturedView(answer.tree),
    };
  }

  return { kind: 'no-app' };
}

/** The error a scene's boot died of, with the file and line of its top frame when it has one. */
function bootError(said: unknown): { name: string; message: string; file: string; line: number } {
  const error = said as { name?: unknown; message?: unknown; topFrames?: unknown } | undefined;
  const frame = keepStrings(error?.topFrames)[0] ?? readAppError(said)?.topFrames?.[0] ?? '';
  const place = /([^\s(]+):(\d+):\d+\)?$/.exec(frame);
  return {
    name: typeof error?.name === 'string' ? error.name : 'Error',
    message: typeof error?.message === 'string' ? error.message : '',
    file: place?.[1] ?? 'unknown',
    line: place ? Number(place[2]) : 0,
  };
}

function playSteps(value: unknown): PlayStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((step: { tap?: unknown; open?: unknown }): PlayStep[] => {
    if (typeof step?.tap === 'string') return [{ tap: step.tap }];
    if (typeof step?.open === 'string') return [{ open: step.open }];
    return [];
  });
}
