/**
 * A POSE PLAYED - `sherlo pose --play <cast file>` runs the real command with every wait the pose
 * scripts at 2 seconds, and writes the terminal's writes as an asciinema v2 cast, masked like the
 * screen. The screen it prints is the still one.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogue, renderPose, POSES_ROOT } from '../catalogue';
import { castText, cutAtTerminators, PLAY_WAIT_MS } from '../playClock';
import { pose, runPose } from '../pose';
import { readPoseDocument } from '../readPose';

/** When set, the posed command is replaced by this function, once per run. */
const instead = vi.hoisted(() => ({ run: undefined as undefined | (() => Promise<void> | void) }));

vi.mock('../../../start', async (importOriginal) => {
  const original = await importOriginal<{ default: () => Promise<void> }>();

  return {
    default: async () => {
      if (instead.run) return instead.run();
      return original.default();
    },
  };
});

const poseFile = (name: string): string => path.join(POSES_ROOT, `${name}.pose.json`);

const folders: string[] = [];
function freshFolder(): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'play-pose-'));
  folders.push(folder);
  return folder;
}

afterEach(() => {
  instead.run = undefined;
  vi.restoreAllMocks();
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

/** Run the `pose` command as the CLI does, keeping what it printed and the code it exited with. */
async function runPoseCommand(documentPath: string, options: { terminal: boolean; play?: string }) {
  const printed: string[] = [];
  const exits: number[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((text: string) => {
    printed.push(text);
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exits.push(code ?? 0);
  }) as typeof process.exit);

  await pose(documentPath, options);
  vi.restoreAllMocks();

  return { stdout: printed.join(''), exitCode: exits[0] };
}

type Event = [number, string, string];
const eventsOf = (cast: string): Event[] =>
  cast
    .split('\n')
    .slice(1)
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Event);

const SPINNER_LINE = 'Waiting for you to click Authorize...';

const loggedIn = () => readPoseDocument(fs.readFileSync(poseFile('login/logged-in'), 'utf8'));

describe('a played pose', () => {
  it('a play run writes a cast file whose frames carry virtual times, each wait counted as 2 seconds', async () => {
    const castFile = path.join(freshFolder(), 'a', 'b', 'login.cast');

    const { exitCode } = await runPoseCommand(poseFile('login/logged-in'), {
      terminal: true,
      play: castFile,
    });

    const cast = fs.readFileSync(castFile, 'utf8');
    const header = JSON.parse(cast.split('\n')[0]);
    expect(header).toMatchObject({ version: 2, width: 80, env: { TERM: 'xterm-256color' } });
    expect(exitCode).toBe(0);

    // Time only moves in whole waits: the server's answer, then each poll's sleep.
    const seconds = eventsOf(cast).map(([at]) => at);
    expect(seconds.every((at) => (at * 1000) % PLAY_WAIT_MS === 0)).toBe(true);
    expect(seconds[seconds.length - 1]).toBeGreaterThanOrEqual((3 * PLAY_WAIT_MS) / 1000);
    expect([...seconds].sort((a, b) => a - b)).toEqual(seconds);
  });

  it('a pose run without the play flag prints the same bytes as before', async () => {
    const name = 'login/logged-in';
    const committed = fs.readFileSync(poseFile(name).replace(/\.pose\.json$/, '.txt'), 'utf8');

    const still = await runPoseCommand(poseFile(name), { terminal: true });
    const played = await runPoseCommand(poseFile(name), {
      terminal: true,
      play: path.join(freshFolder(), 'login.cast'),
    });

    // The catalogue's committed screen is the screen plus the exit-code line renderPose adds.
    expect(await renderPose(poseFile(name))).toBe(committed);
    expect(`${still.stdout}\n[exit ${still.exitCode}]\n`).toBe(committed);
    expect(played.stdout).toBe(still.stdout);
    expect(played.exitCode).toBe(still.exitCode);
  });

  it("the cast of a spinner pose has one frame per tick, and its last frame shows the spinner's line once", async () => {
    const played = await runPose(loggedIn(), { terminal: true, play: 'unused.cast' });

    const frames = played.chunks.filter(({ data }) => data.includes(SPINNER_LINE));
    expect(frames.map(({ atMs }) => atMs)).toEqual([2000, 4000, 6000, 8000]);

    const lastTick = played.chunks.filter(({ atMs }) => atMs === 8000);
    expect(
      lastTick
        .map(({ data }) => data)
        .join('')
        .split(SPINNER_LINE)
    ).toHaveLength(2);
    expect(played.chunks.map(({ data }) => data).join('')).not.toContain('\u001b[?25');
  });

  it('a browser, file or bundler wait is not shortened', async () => {
    const realSetTimeout = globalThis.setTimeout;
    let during: { setTimeout: unknown; elapsedMs: number } | undefined;

    instead.run = async () => {
      const startedAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 40));
      during = { setTimeout: globalThis.setTimeout, elapsedMs: Date.now() - startedAt };
    };
    const played = await runPose(loggedIn(), { terminal: true, play: 'unused.cast' });

    expect(during?.setTimeout).toBe(realSetTimeout);
    expect(during?.elapsedMs).toBeGreaterThanOrEqual(35);
    expect(played.chunks).toEqual([]);
  });

  it('a masked value that spans two writes is not in the cast', async () => {
    const document = { ...loggedIn(), masks: { '<KEY>': 'key-4f9a-77c1' } };
    instead.run = () => {
      process.stdout.write('the key is key-4f');
      process.stdout.write('9a-77c1 and nothing else\n');
    };

    const played = await runPose(document, { terminal: true, play: 'unused.cast' });

    const text = played.chunks.map(({ data }) => data).join('');
    expect(text).toBe('the key is <KEY> and nothing else\n');
    expect(played.screen).toBe(text);
  });

  it('a pose that exits non-zero still writes its cast, into a folder it makes', async () => {
    const castFile = path.join(freshFolder(), 'missing', 'folder', 'failed.cast');
    instead.run = () => {
      console.log('about to fail');
      process.exit(3);
    };

    const { exitCode } = await runPoseCommand(poseFile('login/logged-in'), {
      terminal: true,
      play: castFile,
    });

    expect(exitCode).toBe(3);
    expect(castText(fs.readFileSync(castFile, 'utf8'))).toBe('about to fail\n');
  });

  it('writes are cut after every line end and around cursor moves, each piece keeping the time its first byte came in', () => {
    expect(
      cutAtTerminators([
        { atMs: 0, data: 'one\r\ntw' },
        { atMs: 2000, data: 'o\rthree' },
        { atMs: 4000, data: '\u001b[1Gfour\u001b[36mfive\u001b[39m' },
      ])
    ).toEqual([
      { atMs: 0, data: 'one\r\n' },
      { atMs: 0, data: 'two\r' },
      { atMs: 2000, data: 'three' },
      { atMs: 4000, data: '\u001b[1G' },
      { atMs: 4000, data: 'four\u001b[36mfive\u001b[39m' },
    ]);
  });

  it('no secret the printout hides is in the cast of any pose in the catalogue', async () => {
    for (const { posePath } of catalogue()) {
      const text = fs.readFileSync(posePath, 'utf8');
      const document = readPoseDocument(text);
      const secrets = [
        ...Object.values(document.masks),
        ...(text.match(/sht_[A-Za-z0-9]+/g) ?? []),
      ];
      // Only the poses that name a secret can leak one: the rest would only make this test slow.
      if (secrets.length === 0) continue;

      const played = await runPose(document, { terminal: true, play: 'unused.cast' });
      const hidden = secrets.filter((literal) => !played.screen.includes(literal));

      const castSeen = played.chunks.map(({ data }) => data).join('');
      for (const literal of hidden) expect(castSeen, posePath).not.toContain(literal);
    }
  });
});
