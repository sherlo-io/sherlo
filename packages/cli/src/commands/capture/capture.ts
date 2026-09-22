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
import { DEFAULT_BUNDLER_PORT, JSON_OPTION, PORT_OPTION, STORY_OPTION } from '../../constants';
import { throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { EXIT_BLOCK } from '../../helpers/exitCodes';
import { STABILIZATION_SETTINGS, captureSocket } from '../../seams/captureSocket';
import type { CaptureResult } from '../../seams/captureSocket';
import type { CapturedStory } from '../../render/capturedStory';

export type CaptureOptions = {
  [STORY_OPTION]?: string;
  [PORT_OPTION]?: string;
  [JSON_OPTION]?: boolean;
};

async function capture(passedOptions: CaptureOptions): Promise<void> {
  const storyId = passedOptions[STORY_OPTION];
  if (!storyId) {
    throwError({
      message:
        `\`sherlo capture\` needs the story to capture: \`--${STORY_OPTION} <id>\`.\n` +
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
    process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
  } else {
    emit({ kind: 'captured-story', state: endingFor(answer, { storyId, port }) });
  }

  if (answer.kind !== 'captured') process.exit(EXIT_BLOCK);
}

export default capture;

/* ========================================================================== */

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
      return { kind: 'no-such-story', storyId: run.storyId, known: answer.known };
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
          tree: answer.tree,
        };
      }
      return {
        kind: 'captured',
        storyId: answer.storyId,
        settledMs: answer.settled.ms,
        frames: answer.settled.frames,
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
