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
  STOP_ON_REPEAT_OPTION,
  STORY_OPTION,
  allScenesRefusal,
  discoverRefusal,
  pngWithoutSceneRefusal,
  sceneWithStoryRefusal,
  stopOnRepeatRefusal,
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
import {
  CAPTURES_FOLDER,
  dropCapture,
  guardCapture,
  keepCapture,
  newCapture,
} from '../../seams/localCaptures';
import type { NewCapture } from '../../seams/localCaptures';
import { readLocalDevice } from '../../seams/localDevice';
import type { CaptureResult } from '../../seams/captureSocket';
import type { SceneCaptureResult } from '../../seams/liveScene';
import type { CapturedStory } from '../../render/capturedStory';
import type { CapturedScene, ScenePicture } from '../../render/capturedScene';
import { outcomeOf } from '../../render/capturedAllScenes';
import type { SceneOutcome, SceneRunLine } from '../../render/capturedAllScenes';
import { explainRefusals } from '../../render/refusalExplanation';
import type { RefusalCause } from '../../render/refusalExplanation';

export type CaptureOptions = {
  [STORY_OPTION]?: string;
  [SCENE_OPTION]?: string;
  [ALL_SCENES_OPTION]?: boolean;
  [STOP_ON_REPEAT_OPTION]?: boolean;
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
  if (passedOptions[STOP_ON_REPEAT_OPTION]) {
    throwError({ message: stopOnRepeatRefusal() });
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
  const { answer, kept } = await guardCapture(keptFolder, async () => {
    const target = keptFolder ? await deviceState().sceneTarget() : undefined;
    const answer = await captureSocket().captureStory({
      storyId,
      port,
      settings: STABILIZATION_SETTINGS,
    });
    if (keptFolder && target && isTarget(target) && answer.kind === 'captured') {
      await savePicture(target.device, keptFolder.screenPath);
    }
    return { answer, kept: await keepTheCapture(keptFolder, answer, target) };
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
 * same way. The scenes are read where `--scene` finds one. Each prints one line as it finishes
 * (../../render/capturedAllScenes); a scene failing for the cause the one before it did warns
 * once and the run carries on - or stops, with `--stop-on-repeat` - and a closing summary counts
 * the endings and says where the captures are.
 */
async function captureEveryScene(passedOptions: CaptureOptions): Promise<void> {
  const sceneIds = sceneIdsOfApp(getCwd());
  const asJson = passedOptions[JSON_OPTION] === true;
  if (sceneIds.length === 0 && !asJson) {
    emit({ kind: 'no-scenes-to-capture' });
    return;
  }
  let failed = false;
  const scenes: { sceneId: string; record: unknown }[] = [];
  const counts: Record<SceneOutcome, number> = {
    captured: 0,
    'never-settled': 0,
    'never-reached': 0,
    failed: 0,
  };
  // The cause the scene before failed for, and whether the run has already warned of it.
  let lastCause: RefusalCause | undefined;
  let warned = false;
  for (const [index, sceneId] of sceneIds.entries()) {
    const { answer, record, discover } = await runScene(sceneId, passedOptions);
    failed = failed || sceneFailed(answer, discover);
    counts[outcomeOf(answer.kind)] += 1;
    const cause = causeOfNeverReached(answer);
    const remaining = sceneIds.length - index - 1;
    const repeated = cause !== undefined && cause.id === lastCause?.id && remaining > 0;
    const stopping = repeated && passedOptions[STOP_ON_REPEAT_OPTION] === true;
    const sameCause: SceneRunLine['sameCause'] =
      repeated && (stopping || !warned)
        ? {
            remaining,
            cause: cause.short,
            ...(cause.fakes[0] && { fake: cause.fakes[0] }),
            ...(stopping && { stopped: true as const }),
          }
        : undefined;
    warned ||= sameCause !== undefined;
    lastCause = cause;
    if (asJson) scenes.push({ sceneId, record });
    else emit({ kind: 'scene-run-line', line: { ...sceneRunLine(sceneId, answer), sameCause } });
    if (stopping) break;
  }
  if (asJson) {
    // One document for the whole run; each scene's record is what `--scene <id> --json` prints.
    process.stdout.write(`${JSON.stringify({ scenes }, null, 2)}\n`);
  } else {
    emit({
      kind: 'all-scenes-summary',
      summary: {
        folder: CAPTURES_FOLDER,
        captured: counts.captured,
        neverSettled: counts['never-settled'],
        neverReached: counts['never-reached'],
        failed: counts.failed,
      },
    });
  }
  if (failed) process.exit(EXIT_BLOCK);
}

/** The first cause the refused requests of a scene that never got ready point to, when they point to any. */
function causeOfNeverReached(answer: SceneCaptureResult): RefusalCause | undefined {
  if (answer.kind !== 'never-reached') return undefined;
  return explainRefusals(answer.unanswered)?.causes[0];
}

/** What the line of one scene says, read from the app's answer. */
function sceneRunLine(sceneId: string, answer: SceneCaptureResult): SceneRunLine {
  const said = answer as {
    bootMs?: number;
    settled?: { ms?: number };
    reached?: { ms?: number };
    changing?: string[];
    ready?: string;
    unanswered?: unknown[];
  };
  return {
    sceneId,
    ending: answer.kind,
    ...(said.bootMs && { launchMs: said.bootMs }),
    ...(said.settled?.ms && { settledMs: said.settled.ms }),
    ...(said.reached?.ms !== undefined && { readyMs: said.reached.ms }),
    ...(said.changing && { changing: said.changing }),
    ...(said.ready !== undefined && { ready: said.ready }),
    refused: said.unanswered?.length ?? 0,
  };
}

/** Whether a scene ending leaves the command with the block code; a discover capture's list is not a failure. */
function sceneFailed(answer: SceneCaptureResult, discover: boolean): boolean {
  // A discover capture holds requests, so the scene often never gets ready: that is its list, not a failure.
  return answer.kind !== 'scene' && !(discover && answer.kind === 'never-reached');
}

/** Put one scene through the clean device and keep what came of it; the screen is the caller's. */
function runScene(sceneId: string, passedOptions: CaptureOptions) {
  const keptFolder = openCapture(sceneId);
  return guardCapture(keptFolder, () => runOpenScene(sceneId, passedOptions, keptFolder));
}

async function runOpenScene(
  sceneId: string,
  passedOptions: CaptureOptions,
  keptFolder: NewCapture | undefined
) {
  const port = readPort(passedOptions[PORT_OPTION]);

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
  const startedAt = Date.now();
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
    // The kept picture is of the screen the app ended on: a scene never reached keeps where it stayed.
    // A discover capture takes no picture: it holds requests, so its scene often never gets ready by design.
    const endedOnAScreen =
      answer.kind === 'scene' || (answer.kind === 'never-reached' && !discover);
    if (keptFolder && endedOnAScreen && isTarget(target)) {
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
  // The time a scene waited before giving up is kept beside its record, not printed: `--json` stays as it is.
  const waited = answer.kind === 'never-reached' ? { waitedMs: Date.now() - startedAt } : {};
  const kept = await keepTheCapture(
    keptFolder,
    { ...record, ...waited },
    installed ? target : undefined
  );
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
    // A capture that could not be kept leaves no half-made folder (and no marker) behind.
    dropCapture(keptFolder);
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
