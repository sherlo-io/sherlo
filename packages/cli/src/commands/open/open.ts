/**
 * `sherlo open --story <id>` - put the running app on one named story.
 *
 * The whole road is ../../seams/letterbox: the address Sherlo adds to the bundler, which the SDK
 * inside a running app is listening on. Nothing here talks to Sherlo's backend, reads the project
 * folder or needs a token - this command never leaves the developer's own machine.
 *
 * EVERY ENDING IS A NAMED ONE, because an agent is a first-class caller: it reads the first line
 * and acts on it, and "something went wrong" is not something to act on. The exit code separates
 * the two kinds of ending a caller cares about - the story is on screen, or it is not.
 */
import {
  DEFAULT_BUNDLER_PORT,
  PORT_OPTION,
  SCENE_OPTION,
  STORY_OPTION,
  TIMEOUT_OPTION,
  WAIT_OPTION,
  sceneWithStoryRefusal,
} from '../../constants';
import { throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { EXIT_BLOCK } from '../../helpers/exitCodes';
import { letterbox } from '../../seams/letterbox';
import {
  appIsInstalled,
  deviceState,
  holdTheCleanDevice,
  prepareCleanDevice,
} from '../../seams/deviceState';
import type { OpenStoryResult } from '../../seams/letterbox';
import type { OpenedStory } from '../../render/openedStory';
import type { OpenedScene } from '../../render/openedScene';
import type { OpenSceneResult } from '../../seams/letterbox';

export type OpenOptions = {
  [STORY_OPTION]?: string;
  [SCENE_OPTION]?: string;
  [WAIT_OPTION]?: boolean;
  [PORT_OPTION]?: string;
  [TIMEOUT_OPTION]?: string;
};

/** How long `--wait` waits before it says the app never reported the story. */
const DEFAULT_TIMEOUT_SECONDS = 30;

async function open(passedOptions: OpenOptions): Promise<void> {
  const storyId = passedOptions[STORY_OPTION];
  const sceneId = passedOptions[SCENE_OPTION];

  if (sceneId && storyId) {
    throwError({ message: sceneWithStoryRefusal('open') });
  }
  if (sceneId) return openScene(sceneId, passedOptions);

  if (!storyId) {
    throwError({
      message:
        `\`npx sherlo open\` needs the story to open: \`--${STORY_OPTION} <id>\`.\n` +
        '\n' +
        '  A story id is what Storybook calls it, e.g. `foundation-typography--scales`.',
    });
  }

  const port = readPort(passedOptions[PORT_OPTION]);
  const seconds = readTimeout(passedOptions[TIMEOUT_OPTION]);
  const wait = Boolean(passedOptions[WAIT_OPTION]);

  const answer = await letterbox().openStory({ storyId, wait, port, timeoutSeconds: seconds });
  const state = endingFor(answer, { storyId, port, wait, seconds });

  emit({ kind: 'opened-story', state });

  // A story that is not on screen is the one failure a caller has to be able to branch on, and it
  // is not an error in the tool - the screen above already said what happened, in its own words.
  if (!storyIsOnScreen(state)) process.exit(EXIT_BLOCK);
}

export default open;

/* ========================================================================== */

/**
 * `sherlo open --scene <id>` - the app is booted fresh on one scene and stays there. `--wait` and
 * `--timeout` mean nothing here: the answer comes once the app has booted and moved.
 */
async function openScene(sceneId: string, passedOptions: OpenOptions): Promise<void> {
  const port = readPort(passedOptions[PORT_OPTION]);

  // The scene opens on a clean device, which stays clean until the developer stops the command;
  // every ending - a throw and an interrupt included - puts it back.
  const target = await deviceState().sceneTarget();
  // An app that is not on the device has nothing to clean or launch: it ends as no app attached.
  const installed = !target || (await appIsInstalled(target));
  const restore =
    target && installed ? await prepareCleanDevice(target.device, target.app) : undefined;
  let answer: OpenSceneResult;
  try {
    answer = installed
      ? await letterbox().openScene({ sceneId, port, target })
      : { kind: 'no-app' };
    emit({ kind: 'opened-scene', state: openedSceneEnding(answer, { sceneId, port }) });
    if (restore && answer.kind === 'scene-opened') await holdTheCleanDevice();
  } finally {
    await restore?.();
  }

  if (answer.kind !== 'scene-opened') process.exit(EXIT_BLOCK);
}

/** What the screen shows for what the letterbox answered about a scene. */
export function openedSceneEnding(
  answer: OpenSceneResult,
  run: { sceneId: string; port: number }
): OpenedScene {
  switch (answer.kind) {
    case 'no-bundler':
    case 'no-app':
      return { kind: answer.kind, port: run.port };
    case 'no-such-scene':
      return { kind: 'no-such-scene', sceneId: run.sceneId, known: answer.known };
    case 'scene-opened':
      return { kind: 'opened-scene', sceneId: answer.sceneId, route: answer.route };
    default:
      return answer;
  }
}

/**
 * What the screen shows for what the letterbox answered.
 *
 * The story id comes from the run rather than the answer, because the refusal a reader needs is
 * about the id they typed - an app that does not have it cannot hand it back.
 */
export function endingFor(
  answer: OpenStoryResult,
  run: { storyId: string; port: number; wait: boolean; seconds: number }
): OpenedStory {
  switch (answer.kind) {
    case 'no-bundler':
      return { kind: 'no-bundler', port: run.port };
    case 'no-app':
      return { kind: 'no-app', port: run.port };
    case 'no-such-story':
      return { kind: 'no-such-story', storyId: run.storyId, known: answer.known };
    case 'handed-over':
      if (answer.rendered === 'timed-out') {
        return { kind: 'timed-out', storyId: answer.storyId, seconds: run.seconds };
      }
      // The app painted it and said it threw doing so. That is the developer's news, not the
      // tool's failure - the story IS on screen, showing what it threw.
      if (answer.threw) {
        return { kind: 'painted-and-threw', storyId: answer.storyId, threw: answer.threw };
      }
      return { kind: 'opened', storyId: answer.storyId, waited: run.wait };
  }
}

/**
 * Whether the story reached the screen, which is the only thing this command's exit code says.
 *
 * A story that threw reached it: the developer is looking at their own error where the story
 * should have been, which is exactly what they asked to see. Exiting non-zero there would tell a
 * caller `sherlo open` failed, when what failed is the story.
 */
export function storyIsOnScreen(state: OpenedStory): boolean {
  return state.kind === 'opened' || state.kind === 'painted-and-threw';
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

function readTimeout(passed: string | undefined): number {
  if (passed === undefined) return DEFAULT_TIMEOUT_SECONDS;

  const seconds = Number(passed);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throwError({
      message: `\`--${TIMEOUT_OPTION}\` takes a number of seconds, and \`${passed}\` is not one.`,
    });
  }

  return seconds;
}
