/**
 * A POSE PLAYED - every wait comes due after a fixed 2 seconds, and the writes come back as an
 * asciinema v2 cast whose final screen is today's still screen, byte for byte.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { POSES_ROOT } from '../catalogue';
import { buildPlayCast, castText, PLAY_WAIT_MS } from '../playClock';
import { runPose } from '../pose';
import { readPoseDocument } from '../readPose';

const poseText = (name: string): string =>
  fs.readFileSync(path.join(POSES_ROOT, `${name}.pose.json`), 'utf8');

async function stillAndPlayed(document: string) {
  const still = await runPose(readPoseDocument(document));
  const played = await runPose(readPoseDocument(document), { terminal: true, play: true });
  const cast = buildPlayCast({ chunks: played.chunks, command: 'sherlo pose', width: 80 });
  return { still, played, cast };
}

describe('a played pose', () => {
  it('login: the wait is a spinner that ticks every 2 seconds, and the final screen is the still one', async () => {
    const { still, played, cast } = await stillAndPlayed(poseText('login/logged-in'));

    expect(played.screen).toBe(still.screen);
    expect(played.exitCode).toBe(still.exitCode);
    expect(still.chunks).toEqual([]);

    // The cast carries every byte, and more than the still run wrote: the spinner's frames.
    expect(castText(cast)).toBe(played.unmaskedScreen);
    expect(played.unmaskedScreen.length).toBeGreaterThan(still.unmaskedScreen.length);

    // Time only ever moves in whole waits: a server's answer, then each poll's sleep.
    const times = played.chunks.map(({ atMs }) => atMs);
    expect(times.every((atMs) => atMs % PLAY_WAIT_MS === 0)).toBe(true);
    expect(times[times.length - 1]).toBeGreaterThanOrEqual(3 * PLAY_WAIT_MS);
    expect(cast.split('\n')[0]).toContain('"version":2');
  });

  it('view --wait: progress while the build runs, and the final screen is the still one', async () => {
    const document = JSON.parse(poseText('view/json-wait-needs-review')) as { argv: string[] };
    document.argv = ['view', '7', '--wait'];
    const { still, played, cast } = await stillAndPlayed(JSON.stringify(document));

    expect(played.screen).toBe(still.screen);
    expect(castText(cast)).toBe(played.unmaskedScreen);
    expect(played.chunks[played.chunks.length - 1].atMs).toBeGreaterThanOrEqual(2 * PLAY_WAIT_MS);
  });
});
