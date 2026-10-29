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
  allScenesAloneRefusal,
  discoverRefusal,
  pngWithoutSceneRefusal,
  sceneWithStoryRefusal,
} from '../../constants';
import { throwError } from '../../helpers';
import getCwd from '../../helpers/getCwd';
import { applySceneDevice, deviceOfScene } from '../../seams/sceneDevice';
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
import type { SceneDevice } from '../../seams/deviceState';
import type { CaptureResult } from '../../seams/captureSocket';
import type { SceneCaptureResult } from '../../seams/liveScene';
import { captureAllScenes } from './captureAllScenes';
import type { CapturedStory } from '../../render/capturedStory';
import type { CapturedScene, ScenePicture } from '../../render/capturedScene';

export type CaptureOptions = {
  [STORY_OPTION]?: string;
  [SCENE_OPTION]?: string;
  [DISCOVER_OPTION]?: boolean;
  [PORT_OPTION]?: string;
  [JSON_OPTION]?: boolean;
  [LOGS_OPTION]?: boolean;
  [PNG_OPTION]?: string;
  [ALL_SCENES_OPTION]?: string;
};

async function capture(passedOptions: CaptureOptions): Promise<void> {
  const storyId = passedOptions[STORY_OPTION];
  const sceneId = passedOptions[SCENE_OPTION];
  const allScenesFolder = passedOptions[ALL_SCENES_OPTION];

  if (allScenesFolder) {
    refuseAllScenesWithOthers(passedOptions);
    return captureAllScenes(allScenesFolder, readPort(passedOptions[PORT_OPTION]));
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

  const answer = await captureSocket().captureStory({
    storyId,
    port,
    settings: STABILIZATION_SETTINGS,
  });

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
  const port = readPort(passedOptions[PORT_OPTION]);

  const discover = passedOptions[DISCOVER_OPTION] === true;
  const { answer, notApplied, picture } = await captureOnCleanDevice({
    sceneId,
    port,
    pngPath: passedOptions[PNG_OPTION],
    discover,
  });

  if (passedOptions[JSON_OPTION]) {
    const saved = picture && !picture.error && isPictured(answer) ? { png: picture.path } : {};
    const unapplied = notApplied.length > 0 ? { deviceNotApplied: notApplied } : {};
    const listed = discover ? { discover: true } : {};
    const record = { ...answer, ...saved, ...unapplied, ...listed };
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  } else {
    emit({ kind: 'captured-scene', state: capturedSceneEnding(answer, port, discover), picture });
    if (passedOptions[LOGS_OPTION] && answer.kind !== 'no-bundler' && answer.kind !== 'no-app') {
      emit({ kind: 'captured-log', logs: answer.logs ?? [] });
    }
  }

  // A discover capture holds requests, so the scene often never gets ready: that is its list, not a failure.
  const gotTheList = discover && answer.kind === 'never-reached';
  if (answer.kind !== 'scene' && !gotTheList) process.exit(EXIT_BLOCK);
}

/** `sherlo capture --all-scenes <folder>` stands alone: it takes no single scene, story, picture path or discover capture. */
function refuseAllScenesWithOthers(passedOptions: CaptureOptions): void {
  if (
    passedOptions[SCENE_OPTION] ||
    passedOptions[STORY_OPTION] ||
    passedOptions[PNG_OPTION] ||
    passedOptions[DISCOVER_OPTION]
  ) {
    throwError({ message: allScenesAloneRefusal() });
  }
}

/**
 * An ending that has a screen to save: a scene that held still, one that got ready and never
 * stopped moving, or one that never got ready and whose screen the app read (the picture shows
 * where it stopped).
 */
export function isPictured(answer: SceneCaptureResult): boolean {
  return (
    answer.kind === 'scene' ||
    answer.kind === 'never-settled' ||
    (answer.kind === 'never-reached' && answer.screen !== undefined)
  );
}

/**
 * One scene on a clean device: the phone set as the scene's file says, a fresh launch, the scene
 * read, its picture saved when asked (before the put-back would show the home screen), and every
 * ending - a throw included - puts the device back.
 */
export async function captureOnCleanDevice(run: {
  sceneId: string;
  port: number;
  pngPath?: string;
  discover?: boolean;
}): Promise<{ answer: SceneCaptureResult; notApplied: string[]; picture?: ScenePicture }> {
  const { sceneId, port, pngPath, discover = false } = run;
  const target = await deviceState().sceneTarget();
  // An app that is not on the device has nothing to clean or launch: it ends as no app attached.
  const installed = !isTarget(target) || (await appIsInstalled(target));
  // The scene's own phone setup, read from its file before the device is touched.
  const field = isTarget(target) && installed ? sceneDeviceField(sceneId) : undefined;
  const restore =
    isTarget(target) && installed
      ? await prepareCleanDevice(target.device, target.app, field).catch(endOnNotDebuggable)
      : undefined;
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
    if (picture && isPictured(answer) && isTarget(target)) {
      picture = await savePicture(target.device, picture.path);
    }
  } finally {
    await restore?.();
  }
  return { answer, notApplied, picture };
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
