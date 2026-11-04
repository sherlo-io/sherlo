/** THE KEPT CAPTURES' MARKER - a capture running now is told from one that ended or was killed. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  guardCapture,
  keepCapture,
  newCapture,
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
