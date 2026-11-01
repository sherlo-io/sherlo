/** THE KEPT CAPTURES' MARKER - a capture running now is told from one that ended or was killed. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
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
    expect(readCapturingIds(root)).toEqual(['Inbox-Full']);

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
