/**
 * `sherlo capture --story <id>` - put one story through the same steps a test run does, on the
 * developer's own running app, and print what the run would have recorded.
 *
 * The road is ../../seams/captureSocket: a socket at the bundler's address, relayed between this
 * command and the SDK inside the running app. Nothing here talks to Sherlo's backend, reads the
 * project folder or needs a token.
 *
 * EVERY ENDING IS A NAMED ONE, because an agent is a first-class caller. The exit code says the one
 * thing a caller branches on: whether a record came back. A story that threw, or never settled,
 * still came back with a record - that is the developer's news, not the tool's failure.
 */
import {
  ALL_SCENES_OPTION,
  DEFAULT_BUNDLER_PORT,
  JSON_OPTION,
  LOGS_OPTION,
  DISCOVER_OPTION,
  PNG_OPTION,
  PORT_OPTION,
  SCENE_OPTION,
  STORY_OPTION,
  allScenesRefusal,
  discoverRefusal,
  pngWithoutSceneRefusal,
  sceneWithStoryRefusal,
} from '../../constants';
import { throwError } from '../../helpers';
import getCwd from '../../helpers/getCwd';
import { applySceneDevice, deviceOfScene, sceneIdsOfApp } from '../../seams/sceneDevice';
import type { SceneDeviceField } from '../../seams/sceneDevice';
import { emit } from '../../helpers/transcriptSink';
import { EXIT_BLOCK } from '../../helpers/exitCodes';
import { STABILIZATION_SETTINGS } from '../../seams/bundlerLine';
import { captureSocket } from '../../seams/captureSocket';
import {
  appIsInstalled,
  deviceState,
  endOnNotDebuggable,
  isTarget,
  prepareCleanDevice,
  saveScreenPicture,
} from '../../seams/deviceState';
import type { NoTarget, SceneDevice, SceneTarget } from '../../seams/deviceState';
import { keepCapture, newCapture } from '../../seams/localCaptures';
import type { NewCapture } from '../../seams/localCaptures';
import { readLocalDevice } from '../../seams/localDevice';
import type { CaptureResult } from '../../seams/captureSocket';
import type { SceneCaptureResult } from '../../seams/liveScene';
import type { CapturedStory } from '../../render/capturedStory';
import type { CapturedScene, ScenePicture } from '../../render/capturedScene';

export type CaptureOptions = {
  [STORY_OPTION]?: string;
  [SCENE_OPTION]?: string;
  [ALL_SCENES_OPTION]?: boolean;
  [DISCOVER_OPTION]?: boolean;
  [PORT_OPTION]?: string;
  [JSON_OPTION]?: boolean;
  [LOGS_OPTION]?: boolean;
  [PNG_OPTION]?: string;
};

async function capture(passedOptions: CaptureOptions): Promise<void> {
  const storyId = passedOptions[STORY_OPTION];
  const sceneId = passedOptions[SCENE_OPTION];

  if (passedOptions[ALL_SCENES_OPTION]) {
    if (sceneId || storyId || passedOptions[PNG_OPTION] || passedOptions[DISCOVER_OPTION]) {
      throwError({ message: allScenesRefusal() });
    }
    return captureEveryScene(passedOptions);
  }
  if (sceneId && storyId) {
    throwError({ message: sceneWithStoryRefusal('capture') });
  }
  if (passedOptions[PNG_OPTION] && !sceneId) {
    throwError({ message: pngWithoutSceneRefusal() });
  }
  if (passedOptions[DISCOVER_OPTION] && (!sceneId || passedOptions[PNG_OPTION])) {
    throwError({ message: discoverRefusal() });
  }
  if (sceneId) return captureScene(sceneId, passedOptions);

  if (!storyId) {
    throwError({
      message:
        `\`npx sherlo capture\` needs the story to capture: \`--${STORY_OPTION} <id>\`.\n` +
        '\n' +
        '  A story id is what Storybook calls it, e.g. `foundation-typography--scales`.',
    });
  }

  const port = readPort(passedOptions[PORT_OPTION]);

  const keptFolder = openCapture(storyId);
  const target = keptFolder ? await deviceState().sceneTarget() : undefined;
  const answer = await captureSocket().captureStory({
    storyId,
    port,
    settings: STABILIZATION_SETTINGS,
  });
  if (keptFolder && target && isTarget(target) && answer.kind === 'captured') {
    await savePicture(target.device, keptFolder.screenPath);
  }
  const kept = await keepTheCapture(keptFolder, answer, target);

  if (passedOptions[JSON_OPTION]) {
    // The record already carries the app's own log lines (see ../../seams/captureSocket) - `--json`
    // is a program's own door, so it gets them whether or not `--logs` was also passed.
    process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
  } else {
    emit({ kind: 'captured-story', state: endingFor(answer, { storyId, port }) });

    // The one door that puts the app's own log on a terminal: opt-in, and never woven into the
    // fixed screen above (see ../../render/capturedLog). 'no-bundler' / 'no-app' / 'no-such-story'
    // never reached an app, so there is no log to have asked for.
    if (passedOptions[LOGS_OPTION] && (answer.kind === 'captured' || answer.kind === 'crashed')) {
      emit({ kind: 'captured-log', logs: answer.logs ?? [] });
    }
    if (kept) emit({ kind: 'kept-capture', id: storyId });
  }

  if (answer.kind !== 'captured') process.exit(EXIT_BLOCK);
}

export default capture;

/* ========================================================================== */

/**
 * `sherlo capture --scene <id>` - the app is booted fresh on one scene and read the way a test run
 * reads it. Any ending but the record is a refusal and leaves the process with EXIT_BLOCK.
 */
async function captureScene(sceneId: string, passedOptions: CaptureOptions): Promise<void> {
  const { answer, record, picture, port, discover, kept } = await runScene(sceneId, passedOptions);

  if (passedOptions[JSON_OPTION]) {
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  } else {
    emit({ kind: 'captured-scene', state: capturedSceneEnding(answer, port, discover), picture });
    if (passedOptions[LOGS_OPTION] && answer.kind !== 'no-bundler' && answer.kind !== 'no-app') {
      emit({ kind: 'captured-log', logs: answer.logs ?? [] });
    }
    if (kept) emit({ kind: 'kept-capture', id: sceneId });
  }

  if (sceneFailed(answer, discover)) process.exit(EXIT_BLOCK);
}

/**
 * `sherlo capture --all-scenes` - every scene the app declares, one after another, each kept the
 * same way and each told in one line. The scenes are read where `--scene` finds one.
 */
async function captureEveryScene(passedOptions: CaptureOptions): Promise<void> {
  const sceneIds = sceneIdsOfApp(getCwd());
  if (sceneIds.length === 0) {
    emit({ kind: 'no-scenes-to-capture' });
    return;
  }
  let failed = false;
  for (const sceneId of sceneIds) {
    const { answer, discover } = await runScene(sceneId, passedOptions);
    emit({ kind: 'captured-each-scene', sceneId, ending: answer.kind });
    failed = failed || sceneFailed(answer, discover);
  }
  if (failed) process.exit(EXIT_BLOCK);
}

/** Whether a scene ending leaves the command with the block code; a discover capture's list is not a failure. */
function sceneFailed(answer: SceneCaptureResult, discover: boolean): boolean {
  // A discover capture holds requests, so the scene often never gets ready: that is its list, not a failure.
  return answer.kind !== 'scene' && !(discover && answer.kind === 'never-reached');
}

/** Put one scene through the clean device and keep what came of it; the screen is the caller's. */
async function runScene(sceneId: string, passedOptions: CaptureOptions) {
  const port = readPort(passedOptions[PORT_OPTION]);
  const keptFolder = openCapture(sceneId);

  // The scene runs on a clean device, and every ending - a throw included - puts it back.
  const target = await deviceState().sceneTarget();
  // An app that is not on the device has nothing to clean or launch: it ends as no app attached.
  const installed = !isTarget(target) || (await appIsInstalled(target));
  // The scene's own phone setup, read from its file before the device is touched.
  const field = isTarget(target) && installed ? sceneDeviceField(sceneId) : undefined;
  const restore =
    isTarget(target) && installed
      ? await prepareCleanDevice(target.device, target.app, field).catch(endOnNotDebuggable)
      : undefined;
  const pngPath = passedOptions[PNG_OPTION];
  const discover = passedOptions[DISCOVER_OPTION] === true;
  let answer: SceneCaptureResult;
  let notApplied: string[] = [];
  let picture: ScenePicture | undefined = pngPath ? { path: pngPath } : undefined;
  try {
    if (isTarget(target) && installed) notApplied = await applySceneDevice(target, field);
    answer = installed
      ? await captureSocket().captureScene({
          sceneId,
          port,
          settings: STABILIZATION_SETTINGS,
          target,
          discover,
        })
      : { kind: 'no-app', why: 'not-installed' };
    // The screen as the app left it: the clean device's put-back below would show the home screen.
    if (picture && answer.kind === 'scene' && isTarget(target)) {
      picture = await savePicture(target.device, picture.path);
    }
    // The kept picture is only of a scene that was captured: the record has none of where a failed one ended up.
    if (keptFolder && answer.kind === 'scene' && isTarget(target)) {
      await savePicture(target.device, keptFolder.screenPath);
    }
  } finally {
    await restore?.();
  }
  const saved = picture && !picture.error && answer.kind === 'scene' ? { png: picture.path } : {};
  const unapplied = notApplied.length > 0 ? { deviceNotApplied: notApplied } : {};
  const listed = discover ? { discover: true } : {};
  const record = { ...answer, ...saved, ...unapplied, ...listed };
  // An app that was never on the device ran on nothing, so no device is named for it.
  const kept = await keepTheCapture(keptFolder, record, installed ? target : undefined);
  return { answer, record, picture, port, discover, kept };
}

/** The folder one capture is kept in; a folder that cannot be made keeps nothing and changes no ending. */
function openCapture(id: string): NewCapture | undefined {
  try {
    return newCapture(getCwd(), id);
  } catch {
    return undefined;
  }
}

/** Keep the record and the device the capture ran on beside the picture; false when nothing could be kept. */
async function keepTheCapture(
  keptFolder: NewCapture | undefined,
  record: unknown,
  target: SceneTarget | NoTarget | undefined
): Promise<boolean> {
  if (!keptFolder) return false;
  try {
    const device = target && isTarget(target) ? await readLocalDevice(target.device) : undefined;
    keepCapture(keptFolder, { record, device });
    return true;
  } catch {
    return false;
  }
}

/** The device the scene's file declares; a field that is not a plain literal ends the command, naming the file. */
function sceneDeviceField(sceneId: string): SceneDeviceField | undefined {
  try {
    return deviceOfScene(getCwd(), sceneId);
  } catch (error) {
    return throwError({ message: error instanceof Error ? error.message : String(error) });
  }
}

/** Save the device's screen to `path`; a failed save is the picture's own error and changes no ending. */
async function savePicture(device: SceneDevice, path: string): Promise<ScenePicture> {
  try {
    await saveScreenPicture(device, path);
    return { path };
  } catch (error) {
    return { path, error: error instanceof Error ? error.message : String(error) };
  }
}

/** What the screen shows for what the app answered about a scene: the bundler's refusals carry the port. */
export function capturedSceneEnding(
  answer: SceneCaptureResult,
  port: number,
  discover = false
): CapturedScene {
  if (answer.kind === 'no-bundler' || answer.kind === 'no-app') return { kind: answer.kind, port };
  return discover ? { ...answer, discover: true } : answer;
}

/** What the screen shows for what the app answered. */
export function endingFor(
  answer: CaptureResult,
  run: { storyId: string; port: number }
): CapturedStory {
  switch (answer.kind) {
    case 'no-bundler':
      return { kind: 'no-bundler', port: run.port };
    case 'no-app':
      return { kind: 'no-app', port: run.port };
    case 'no-such-story':
      return {
        kind: 'no-such-story',
        storyId: run.storyId,
        known: answer.known,
        ...(answer.brokenFiles && { brokenFiles: answer.brokenFiles }),
      };
    case 'crashed':
      return {
        kind: 'crashed',
        storyId: answer.storyId,
        ...(answer.error && { error: answer.error }),
      };
    case 'captured':
      if (answer.threw) {
        return {
          kind: 'captured-and-threw',
          storyId: answer.storyId,
          threw: answer.threw,
          tree: answer.tree,
        };
      }
      if (answer.settled === 'timed-out') {
        return {
          kind: 'never-settled',
          storyId: answer.storyId,
          seconds: STABILIZATION_SETTINGS.timeoutMs / 1000,
          ...(answer.changing && { changing: answer.changing }),
          tree: answer.tree,
        };
      }
      return {
        kind: 'captured',
        storyId: answer.storyId,
        settledMs: answer.settled.ms,
        frames: answer.settled.frames,
        ...(answer.parts !== undefined && { parts: answer.parts }),
        ...(answer.hasNetworkImage !== undefined && { hasNetworkImage: answer.hasNetworkImage }),
        ...(answer.stillReal && { stillReal: answer.stillReal }),
        ...(answer.unanswered && { unanswered: answer.unanswered }),
        tree: answer.tree,
      };
  }
}

function readPort(passed: string | undefined): number {
  if (passed === undefined) return DEFAULT_BUNDLER_PORT;

  const port = Number(passed);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throwError({
      message: `\`--${PORT_OPTION}\` takes a port number, and \`${passed}\` is not one.`,
    });
  }

  return port;
}
