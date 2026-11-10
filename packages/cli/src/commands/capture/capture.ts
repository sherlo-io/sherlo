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
import { sceneIdsOfApp } from '../../seams/sceneDevice';
import { emit } from '../../helpers/transcriptSink';
import { EXIT_BLOCK } from '../../helpers/exitCodes';
import { STABILIZATION_SETTINGS } from '../../seams/bundlerLine';
import { captureSocket } from '../../seams/captureSocket';
import { deviceState, isTarget } from '../../seams/deviceState';
import {
  CAPTURES_FOLDER,
  guardCapture,
  pictureKeptFor,
  sceneCameUp,
} from '../../seams/localCaptures';
import { readPort } from '../../helpers/readPort';
import { keepTheCapture, openCapture, runScene, savePicture } from './runScene';
import type { CaptureResult } from '../../seams/captureSocket';
import type { CaptureOptions } from './captureOptions';
import type { SceneCaptureResult } from '../../seams/liveScene';
import type { CapturedStory } from '../../render/capturedStory';
import { pngPictureWritten } from '../../render/capturedScene';
import type { CapturedScene } from '../../render/capturedScene';
import type { NoAppEnding } from '../../render/noAppLines';
import { lineAfterScene } from '../../render/lineAfterScene';
import { sceneCauseOf } from '../../seams/sceneCause';
import type { CauseStreak } from '../../seams/sceneCause';
import { outcomeOf } from '../../render/sceneOutcome';
import type { SceneOutcome } from '../../render/sceneOutcome';

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
    if (kept) {
      emit({
        kind: 'kept-capture',
        id: storyId,
        ...(answer.kind !== 'captured' && { picture: false as const }),
      });
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
  const { answer, record, picture, port, discover, kept } = await runScene(sceneId, passedOptions);

  if (passedOptions[JSON_OPTION]) {
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  } else {
    const state = capturedSceneEnding(answer, port, discover);
    emit({ kind: 'captured-scene', state, picture });
    if (passedOptions[LOGS_OPTION] && answer.kind !== 'no-bundler' && answer.kind !== 'no-app') {
      emit({ kind: 'captured-log', logs: answer.logs ?? [] });
    }
    if (kept) {
      // The same condition runScene keeps a picture by: only a scene that came up and threw nothing.
      // A scene whose --png picture was written still says where it is kept: the screen already says "Picture saved".
      const pictureSaved =
        pictureKeptFor(getCwd(), sceneId, answer).saves || pngPictureWritten(state, picture);
      emit({
        kind: 'kept-capture',
        id: sceneId,
        ...(!pictureSaved && { picture: false as const }),
      });
    }
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
  let streak: CauseStreak = { count: 0, warned: false };
  const scenes: { sceneId: string; record: unknown }[] = [];
  const counts: Record<SceneOutcome, number> = {
    captured: 0,
    'never-settled': 0,
    'never-reached': 0,
    failed: 0,
  };
  for (const [index, sceneId] of sceneIds.entries()) {
    const { answer, record, discover } = await runScene(sceneId, passedOptions);
    failed = failed || sceneFailed(answer, discover);
    counts[outcomeOf(answer.kind)] += 1;
    const remaining = sceneIds.length - index - 1;
    const stopOnRepeat = passedOptions[STOP_ON_REPEAT_OPTION] === true;
    const after = lineAfterScene(
      sceneId,
      answer,
      sceneCauseOf(answer),
      remaining,
      stopOnRepeat,
      streak
    );
    streak = after.streak;
    const { stopping } = after;
    if (asJson) scenes.push({ sceneId, record });
    else emit({ kind: 'scene-run-line', line: after.line });
    // Code that does not build fails every scene the same way: it is said once, before the rest run.
    if (answer.kind === 'bundle-does-not-build' && !asJson) {
      emit({
        kind: 'captured-scene',
        state: capturedSceneEnding(answer, readPort(passedOptions[PORT_OPTION])),
      });
      break;
    }
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

/** Whether a scene ending leaves the command with the block code; a discover capture's list is not a failure. */
function sceneFailed(answer: SceneCaptureResult, discover: boolean): boolean {
  // A discover capture holds requests, so the scene often never gets ready: that is its list, not a failure.
  return answer.kind !== 'scene' && !(discover && answer.kind === 'never-reached');
}

/**
 * What the screen shows for a capture that found no app. An app refused for its code, old or with no
 * launch code, is told what to do about it: the screen shows that detail under `why: 'old-code'`.
 * The other causes have no words of their own here.
 */
function noAppEnding(answer: { why?: string; detail?: string }, port: number): NoAppEnding {
  const refusedForItsCode = answer.why === 'old-code' || answer.why === 'no-launch-code';
  return refusedForItsCode && answer.detail !== undefined
    ? { kind: 'no-app', port, why: 'old-code', detail: answer.detail }
    : { kind: 'no-app', port };
}

/** What the screen shows for what the app answered about a scene: the bundler's refusals carry the port. */
export function capturedSceneEnding(
  answer: SceneCaptureResult,
  port: number,
  discover = false
): CapturedScene {
  if (answer.kind === 'no-bundler') return { kind: answer.kind, port };
  if (answer.kind === 'no-app') return noAppEnding(answer, port);
  // The screen has no ending of its own for a scene that kept its picture and had a request refused:
  // it shows the scene, with the refused requests it lists.
  const shown = sceneCameUp(answer) ? { ...answer, kind: 'scene' as const } : answer;
  return discover ? { ...shown, discover: true } : shown;
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
      return noAppEnding(answer, run.port);
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
