/**
 * `sherlo pose --no-terminal` (sherlo / Drawing for a plan): the screen an agent or a CI log
 * receives - the same run, with the streams answering as a pipe instead of a terminal.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { POSES_ROOT } from '../catalogue';
import { runPose } from '../pose';
import { readPoseDocument } from '../readPose';

/** When set, the posed command is replaced by this look at the streams, once per run. */
const lookAtTheStreams = vi.hoisted(() => ({ instead: undefined as undefined | (() => void) }));

// The command is the shipped one in every case but the first: there it is swapped for a look at
// the streams, the one place a run's own code can be asked what they say during the run.
vi.mock('../../../start', async (importOriginal) => {
  const original = await importOriginal<{ default: () => Promise<void> }>();

  return {
    default: async () => {
      if (lookAtTheStreams.instead) return lookAtTheStreams.instead();
      return original.default();
    },
  };
});

const STREAM_PROPERTIES = [
  'isTTY',
  'columns',
  'cursorTo',
  'clearLine',
  'moveCursor',
  'clearScreenDown',
] as const;

/** Every property a pipe answers for, as one stream says it right now. */
function whatTheStreamSays(stream: NodeJS.WriteStream): Record<string, unknown> {
  return Object.fromEntries(
    STREAM_PROPERTIES.map((name) => [name, (stream as unknown as Record<string, unknown>)[name]])
  );
}

function loggedInPose(env: Record<string, string> = {}) {
  const document = fs.readFileSync(path.join(POSES_ROOT, 'login', 'logged-in.pose.json'), 'utf8');
  const pose = readPoseDocument(document);

  return { ...pose, env: { ...pose.env, ...env } };
}

/** A colour escape: `ESC [ ... m`. */
const COLOUR_CODE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`);

describe('sherlo pose --no-terminal', () => {
  it('with --no-terminal the streams answer as a pipe: not a terminal, no width, no cursor moves', async () => {
    const streams = [process.stdout, process.stderr];
    const before = streams.map(whatTheStreamSays);
    const seenDuringRun: Array<Record<string, unknown>> = [];

    lookAtTheStreams.instead = () => {
      seenDuringRun.push(...streams.map(whatTheStreamSays));
    };

    try {
      await runPose(loggedInPose(), { terminal: false });
    } finally {
      lookAtTheStreams.instead = undefined;
    }

    expect(seenDuringRun).toHaveLength(2);
    for (const seen of seenDuringRun) {
      expect(seen).toEqual({
        isTTY: false,
        columns: undefined,
        cursorTo: undefined,
        clearLine: undefined,
        moveCursor: undefined,
        clearScreenDown: undefined,
      });
    }

    // Afterwards the streams are exactly as they were.
    expect(streams.map(whatTheStreamSays)).toEqual(before);
  });

  it("with --no-terminal colour is off unless the pose's own settings force it", async () => {
    const onATerminal = await runPose(loggedInPose(), { terminal: true });
    expect(onATerminal.screen).toMatch(COLOUR_CODE);

    const onAPipe = await runPose(loggedInPose(), { terminal: false });
    expect(onAPipe.screen).toContain('Logged in as anna@example.com');
    expect(onAPipe.screen).not.toMatch(COLOUR_CODE);

    const forced = await runPose(loggedInPose({ FORCE_COLOR: '1' }), { terminal: false });
    expect(forced.screen).toMatch(COLOUR_CODE);
  });
});
