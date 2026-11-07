/** THE KEPT CAPTURES' MARKER - a capture running now is told from one that ended or was killed. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changeSinceLastKeptRun,
  guardCapture,
  keepCapture,
  newCapture,
  pictureKeptFor,
  readCapturingIds,
  readKeptCaptures,
  samePicture,
} from '../localCaptures';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-captures-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the capturing marker', () => {
  it('marks a capture from its start until it is kept', () => {
    const started = newCapture(root, 'Inbox/Full');
    expect(readCapturingIds(root)).toEqual(['Inbox/Full']);

    keepCapture(started, { record: { kind: 'scene' } });
    expect(readCapturingIds(root)).toEqual([]);
  });

  it('forgets a marker a killed capture left behind', () => {
    newCapture(root, 'Inbox');
    const sixteenMinutesLater = Date.now() + 16 * 60 * 1000;
    expect(readCapturingIds(root, sixteenMinutesLater)).toEqual([]);
  });

  it('reads nothing from a project that has kept nothing', () => {
    expect(readCapturingIds(root)).toEqual([]);
  });
});

describe('reading the kept captures while one is being written', () => {
  it('leaves out a capture whose record is half written and reads the rest', () => {
    const whole = newCapture(root, 'Whole', new Date('2026-11-01T09:00:00.000Z'));
    keepCapture(whole, { record: { kind: 'scene' } });
    const half = newCapture(root, 'Half', new Date('2026-11-01T09:01:00.000Z'));
    fs.writeFileSync(path.join(half.folder, 'record.json'), '{"kind": "sce');

    expect(readKeptCaptures(root).map((capture) => capture.id)).toEqual(['Whole']);
  });
});

describe('the id a kept capture is read back by', () => {
  it("a kept record's folder already holds its device", () => {
    const started = newCapture(root, 'Inbox');
    const device = { model: 'iPhone 15' } as never;
    const record = path.join(started.folder, 'record.json');
    // The record is written second: the moment it exists, the device is there.
    const write = fs.writeFileSync;
    const seen: boolean[] = [];
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(((file: string, data: string) => {
      if (file === record) seen.push(fs.existsSync(path.join(started.folder, 'device.json')));
      return write(file, data);
    }) as never);
    try {
      keepCapture(started, { record: { sceneId: 'Inbox' }, device });
    } finally {
      spy.mockRestore();
    }
    expect(seen).toEqual([true]);
  });

  it('a scene named with a slash keeps its name', () => {
    keepCapture(newCapture(root, 'Inbox/Full'), { record: { sceneId: 'Inbox/Full' } });
    expect(readKeptCaptures(root).map((capture) => capture.id)).toEqual(['Inbox/Full']);
  });

  it('two scenes that differ only by a slash stay two scenes', () => {
    keepCapture(newCapture(root, 'a/b', new Date('2026-11-01T09:00:00.000Z')), {
      record: { sceneId: 'a/b' },
    });
    keepCapture(newCapture(root, 'a-b', new Date('2026-11-01T09:01:00.000Z')), {
      record: { sceneId: 'a-b' },
    });
    expect(readKeptCaptures(root).map((capture) => capture.id)).toEqual(['a/b', 'a-b']);
  });

  it('a record that names no id falls back to its folder name', () => {
    keepCapture(newCapture(root, 'x'), { record: { kind: 'no-bundler' } });
    expect(readKeptCaptures(root).map((capture) => capture.id)).toEqual(['x']);
  });
});

describe('a capture that did not end in a record', () => {
  it('is dropped, folder and marker, when what fills it throws', async () => {
    const started = newCapture(root, 'Inbox');
    await expect(
      guardCapture(started, async () => {
        throw new Error('the device vanished');
      })
    ).rejects.toThrow('the device vanished');
    expect(fs.existsSync(started.folder)).toBe(false);
    expect(readCapturingIds(root)).toEqual([]);
  });
});

describe('a signal during a capture', () => {
  /** Send SIGINT in the middle of a guarded capture; `others` are the handlers left on the signal. */
  async function interrupted(others: (() => void)[]) {
    const started = newCapture(root, 'Inbox');
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const before = process.listeners('SIGINT');
    process.removeAllListeners('SIGINT');
    others.forEach((other) => process.on('SIGINT', other));
    try {
      await guardCapture(started, async () => {
        (process as NodeJS.EventEmitter).emit('SIGINT');
      });
      return { started, exitedWith: exit.mock.calls.map(([code]) => code) };
    } finally {
      process.removeAllListeners('SIGINT');
      before.forEach((listener) => process.on('SIGINT', listener as () => void));
      exit.mockRestore();
    }
  }

  it('drops the capture and ends the process when the guard is the only handler', async () => {
    const { started, exitedWith } = await interrupted([]);
    expect(fs.existsSync(started.folder)).toBe(false);
    expect(exitedWith).toEqual([130]);
  });

  it('drops the capture and leaves the exit to the other handler', async () => {
    const other = vi.fn();
    const { started, exitedWith } = await interrupted([other]);
    expect(fs.existsSync(started.folder)).toBe(false);
    expect(other).toHaveBeenCalledOnce();
    expect(exitedWith).toEqual([]);
  });
});

describe('comparing pictures', () => {
  it('is the same when the bytes are, and not when they differ or one is missing', () => {
    const one = path.join(root, 'one.png');
    const two = path.join(root, 'two.png');
    const three = path.join(root, 'three.png');
    fs.writeFileSync(one, 'aaa');
    fs.writeFileSync(two, 'aaa');
    fs.writeFileSync(three, 'bbb');

    expect(samePicture(one, two)).toBe(true);
    expect(samePicture(one, three)).toBe(false);
    expect(samePicture(one, path.join(root, 'missing.png'))).toBe(false);
  });
});

describe('a scene set against its last kept run', () => {
  const keep = (record: object, minute: number) =>
    keepCapture(newCapture(root, 'Inbox', new Date(Date.UTC(2026, 10, 1, 9, minute))), {
      record: { sceneId: 'Inbox', ...record },
      device: undefined,
    });

  it('a scene that got less far than its last kept run says what changed in one line', () => {
    keep({ kind: 'scene', reached: { route: ['Inbox'] } }, 1);

    const { lastRun, change } = changeSinceLastKeptRun(root, 'Inbox', {
      ending: 'never-reached',
      route: ['Login'],
      refused: 0,
    });

    expect(lastRun).toEqual({ ending: 'captured', route: ['Inbox'], refused: 0 });
    expect(change).toBe(
      'Inbox got less far than its last kept run: was captured on Inbox, now never got ready on Login'
    );
  });

  it('a kept incomplete scene is the last run the comparison reads, counted as captured with its refusals', () => {
    keep({ kind: 'incomplete', reached: { route: ['Inbox'] }, unanswered: [{}, {}] }, 3);

    const { lastRun, change } = changeSinceLastKeptRun(root, 'Inbox', {
      ending: 'never-reached',
      route: ['Login'],
      refused: 0,
    });

    expect(lastRun).toEqual({ ending: 'captured', route: ['Inbox'], refused: 2 });
    expect(change).toContain('was captured on Inbox');
  });

  it('a scene that got as far, or has no kept run, says nothing changed', () => {
    expect(
      changeSinceLastKeptRun(root, 'Inbox', { ending: 'captured', route: [], refused: 0 })
    ).toEqual({});
    keep({ kind: 'never-reached', stayedOn: ['Login'] }, 2);

    const { change } = changeSinceLastKeptRun(root, 'Inbox', {
      ending: 'captured',
      route: ['Inbox'],
      refused: 0,
    });

    expect(change).toBeUndefined();
  });
});

describe('the picture a capture keeps', () => {
  const keepWithPicture = (minute: number) => {
    const capture = newCapture(root, 'Inbox', new Date(Date.UTC(2026, 10, 1, 9, minute)));
    fs.writeFileSync(capture.screenPath, 'png');
    keepCapture(capture, { record: { kind: 'scene', sceneId: 'Inbox' } });
    return capture.screenPath;
  };

  it('a scene that ended without a capture saves no picture and keeps its last captured one', () => {
    const lastCaptured = keepWithPicture(1);

    expect(pictureKeptFor(root, 'Inbox', { kind: 'never-settled' })).toEqual({
      saves: false,
      ending: 'not-captured',
      lastPicture: lastCaptured,
    });
    expect(pictureKeptFor(root, 'Inbox', { kind: 'scene' })).toEqual({
      saves: true,
      ending: 'captured',
    });
  });

  it('a scene that stopped on another screen keeps the frame it ended on to show, never as its picture', () => {
    const lastCaptured = keepWithPicture(1);
    const stopped = newCapture(root, 'Inbox', new Date(Date.UTC(2026, 10, 1, 9, 2)));
    fs.writeFileSync(stopped.endedPath, 'frame');
    keepCapture(stopped, { record: { kind: 'never-reached', sceneId: 'Inbox' } });

    const [, later] = readKeptCaptures(root);
    expect(later.endedPath).toBe(stopped.endedPath);
    expect(later).not.toHaveProperty('screenPath');
    expect(pictureKeptFor(root, 'Inbox', { kind: 'never-reached' }).lastPicture).toBe(lastCaptured);
  });

  it('a scene that ended on the red error screen is flagged as threw and its frame is not saved as a good picture', () => {
    const lastCaptured = keepWithPicture(1);

    expect(
      pictureKeptFor(root, 'Inbox', { kind: 'scene', threw: { name: 'TypeError', message: 'm' } })
    ).toEqual({ saves: false, ending: 'threw', lastPicture: lastCaptured });
  });
});
