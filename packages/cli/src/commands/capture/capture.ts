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
  DEFAULT_BUNDLER_PORT,
  JSON_OPTION,
  LOGS_OPTION,
  PORT_OPTION,
  SCENE_OPTION,
  STORY_OPTION,
  sceneWithStoryRefusal,
} from '../../constants';
import { throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { EXIT_BLOCK } from '../../helpers/exitCodes';
import { STABILIZATION_SETTINGS, captureSocket } from '../../seams/captureSocket';
import { deviceState, prepareCleanDevice } from '../../seams/deviceState';
import type { CaptureResult, SceneCaptureResult } from '../../seams/captureSocket';
import type { CapturedStory } from '../../render/capturedStory';
import type { CapturedScene } from '../../render/capturedScene';

export type CaptureOptions = {
  [STORY_OPTION]?: string;
  [SCENE_OPTION]?: string;
  [PORT_OPTION]?: string;
  [JSON_OPTION]?: boolean;
  [LOGS_OPTION]?: boolean;
};

async function capture(passedOptions: CaptureOptions): Promise<void> {
  const storyId = passedOptions[STORY_OPTION];
  const sceneId = passedOptions[SCENE_OPTION];

  if (sceneId && storyId) {
    throwError({ message: sceneWithStoryRefusal('capture') });
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

  // The scene runs on a clean device, and every ending - a throw included - puts it back.
  const target = await deviceState().sceneTarget();
  const restore = target && (await prepareCleanDevice(target.device, target.app));
  let answer: SceneCaptureResult;
  try {
    answer = await captureSocket().captureScene({
      sceneId,
      port,
      settings: STABILIZATION_SETTINGS,
    });
  } finally {
    await restore?.();
  }

  if (passedOptions[JSON_OPTION]) {
    process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
  } else {
    emit({ kind: 'captured-scene', state: capturedSceneEnding(answer, port) });
  }

  if (answer.kind !== 'scene') process.exit(EXIT_BLOCK);
}

/** What the screen shows for what the app answered about a scene: the bundler's refusals carry the port. */
export function capturedSceneEnding(answer: SceneCaptureResult, port: number): CapturedScene {
  return answer.kind === 'no-bundler' || answer.kind === 'no-app'
    ? { kind: answer.kind, port }
    : answer;
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
