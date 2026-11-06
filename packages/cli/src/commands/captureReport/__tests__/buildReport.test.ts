/** THE CAPTURE REPORT - what the local review page and `--json` read, built from the kept captures. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { installDeviceState, posedDeviceState } from '../../../seams/deviceState';
import { keepCapture, newCapture, readKeptCaptures } from '../../../seams/localCaptures';
import type { KeptCapture } from '../../../seams/localCaptures';
import { readLocalDevice } from '../../../seams/localDevice';
import { buildReport } from '../buildReport';

const sceneRecord = {
  kind: 'scene',
  bootMs: 100,
  reached: { route: ['Inbox', 'Full'], ms: 200 },
  settled: { ms: 300 },
  play: [{ tap: 'send' }],
  tree: { size: { width: 390, height: 844 } },
};

const neverReached = { kind: 'never-reached', stayedOn: ['Home'], ready: 'Inbox' };

function kept(over: Partial<KeptCapture> & { record?: unknown }): KeptCapture {
  return {
    folder: '/p/.sherlo/captures/x',
    at: '2026-11-01T09:30:00.000Z',
    id: 'Inbox/Full',
    record: sceneRecord,
    screenPath: '/p/.sherlo/captures/x/screen.png',
    device: { deviceId: 'iphone.15.pro', os: 'iOS 17' },
    ...over,
  };
}

const build = (
  captures: KeptCapture[],
  over: { capturingIds?: string[]; samePicture?: (a: string, b: string) => boolean } = {}
) =>
  buildReport({
    captures,
    capturingIds: over.capturingIds ?? [],
    samePicture: over.samePicture ?? (() => true),
    isLive: false,
    timeZone: 'UTC',
    pictureOf: (capture) => `pictures/${capture.screenPath}`,
  });

describe('the clock time of the newest capture', () => {
  it("falls back to this computer's clock when TZ is empty or not a zone name", () => {
    for (const timeZone of ['', 'CET-1']) {
      const report = buildReport({
        captures: [kept({})],
        capturingIds: [],
        samePicture: () => true,
        isLive: false,
        timeZone,
        pictureOf: () => '',
      });

      expect(report.summary.lastCaptureAt).toMatch(/^\d\d:\d\d$/);
    }
  });
});

describe('the capture report', () => {
  it('the latest capture of each screen on each device is the one shown', () => {
    const report = build([
      kept({ folder: 'a', screenPath: 'a.png', at: '2026-11-01T09:00:00.000Z' }),
      kept({ folder: 'b', screenPath: 'b.png', at: '2026-11-01T10:00:00.000Z' }),
      kept({
        folder: 'c',
        screenPath: 'c.png',
        device: { local: true, model: 'Pixel 9', os: 'Android 15' },
      }),
    ]);

    expect(report.captures.map((capture) => capture.picture).sort()).toEqual([
      'pictures/b.png',
      'pictures/c.png',
    ]);
  });

  it('a scene that was not captured never wears changed', () => {
    const failed = kept({ folder: 'b', screenPath: 'b.png', record: neverReached });
    const report = build([kept({ folder: 'a', screenPath: 'a.png' }), failed], {
      samePicture: () => false,
    });

    expect(report.captures[0].changed).toBe(false);
    expect(report.summary.changedCount).toBe(0);
  });

  it('a failed scene captured again with a new picture wears changed', () => {
    const report = build(
      [
        kept({ folder: 'a', screenPath: 'a.png', at: '2026-11-01T08:00:00.000Z' }),
        kept({
          folder: 'b',
          screenPath: 'b.png',
          record: neverReached,
          at: '2026-11-01T09:00:00.000Z',
        }),
        kept({ folder: 'c', screenPath: 'c.png', at: '2026-11-01T10:00:00.000Z' }),
      ],
      { samePicture: () => false }
    );

    expect(report.captures[0].changed).toBe(true);
    expect(report.captures[0].previousPicture).toBe('pictures/a.png');
    expect(report.summary.changedCount).toBe(1);
  });

  it('a capture after a captured one that kept no picture is compared with the last picture', () => {
    const report = build(
      [
        kept({ folder: 'a', screenPath: 'a.png', at: '2026-11-01T08:00:00.000Z' }),
        kept({ folder: 'b', screenPath: undefined, at: '2026-11-01T09:00:00.000Z' }),
        kept({ folder: 'c', screenPath: 'c.png', at: '2026-11-01T10:00:00.000Z' }),
      ],
      { samePicture: () => false }
    );

    expect(report.captures[0].changed).toBe(true);
    expect(report.captures[0].previousPicture).toBe('pictures/a.png');
  });

  it('a capture after only a failed one that kept a picture is new, not changed', () => {
    const report = build(
      [
        kept({
          folder: 'b',
          screenPath: 'b.png',
          record: neverReached,
          at: '2026-11-01T09:00:00.000Z',
        }),
        kept({ folder: 'c', screenPath: 'c.png', at: '2026-11-01T10:00:00.000Z' }),
      ],
      { samePicture: () => false }
    );

    expect(report.captures[0].changed).toBe(false);
    expect(report.captures[0]).not.toHaveProperty('previousPicture');
  });

  it('a capture after one that saved no picture is compared with the last picture, and shows Changed', () => {
    const report = build(
      [
        kept({ folder: 'a', screenPath: 'a.png', at: '2026-11-01T08:00:00.000Z' }),
        kept({
          folder: 'b',
          screenPath: undefined,
          record: neverReached,
          at: '2026-11-01T09:00:00.000Z',
        }),
        kept({ folder: 'c', screenPath: 'c.png', at: '2026-11-01T10:00:00.000Z' }),
      ],
      { samePicture: () => false }
    );

    expect(report.captures[0].changed).toBe(true);
    expect(report.captures[0].previousPicture).toBe('pictures/a.png');
  });

  it('a changed capture carries the picture of the capture before it', () => {
    const first = kept({ screenPath: 'one.png', at: '2026-11-01T09:00:00.000Z' });
    const second = kept({ screenPath: 'two.png', at: '2026-11-01T10:00:00.000Z' });

    const changed = build([first, second], { samePicture: () => false }).captures[0];
    expect(changed.picture).toBe('pictures/two.png');
    expect(changed.previousPicture).toBe('pictures/one.png');

    expect(build([first, second], { samePicture: () => true }).captures[0]).not.toHaveProperty(
      'previousPicture'
    );
    expect(build([second]).captures[0]).not.toHaveProperty('previousPicture');
  });

  it('a screen whose picture differs from its previous local capture is marked changed', () => {
    const first = kept({ screenPath: 'one.png', at: '2026-11-01T09:00:00.000Z' });
    const second = kept({ screenPath: 'two.png', at: '2026-11-01T10:00:00.000Z' });

    expect(build([first, second], { samePicture: () => false }).captures[0].changed).toBe(true);
    expect(build([first, second], { samePicture: () => true }).captures[0].changed).toBe(false);
    expect(build([second]).captures[0].changed).toBe(false);
  });

  it('failed captures come before captured ones', () => {
    const report = build(
      [
        kept({ id: 'A', record: sceneRecord }),
        kept({ id: 'B', record: neverReached, screenPath: undefined }),
      ],
      { capturingIds: ['A'] }
    );

    expect(report.captures.map((capture) => capture.id)).toEqual(['B', 'A']);
    expect(report.summary).toMatchObject({ capturedCount: 1, notCapturedCount: 1 });
  });

  it('a capture with no known device claims no system', () => {
    const [capture] = build([kept({ device: undefined })]).captures;

    expect(capture.device).toEqual({
      model: 'Unknown device',
      osVersion: '',
      screenWidth: 390,
      screenHeight: 844,
      screenSizeInInches: 0,
    });
  });

  it('a capture on a simulator Sherlo does not have keeps its name through to the page', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'named-capture-'));
    const avdFolder = path.join(root, 'avd', 'tester-ephemeral-1762050000.avd');
    fs.mkdirSync(avdFolder, { recursive: true });
    fs.writeFileSync(
      path.join(avdFolder, 'config.ini'),
      'hw.device.name=pixel_xl\r\nimage.sysdir.1=system-images/android-31/default/arm64-v8a/\r\n'
    );
    vi.stubEnv('ANDROID_AVD_HOME', path.join(root, 'avd'));
    // The emulator console answers with the name, then OK, each line ended by CR LF.
    const undo = installDeviceState({
      ...posedDeviceState(),
      run: async (_tool, args) =>
        args.includes('path') ? avdFolder + '\r\nOK\r\n' : 'tester-ephemeral-1762050000\r\nOK\r\n',
    });
    try {
      const device = await readLocalDevice({ platform: 'android', serial: 'emulator-5600' });
      keepCapture(newCapture(root, 'Inbox/Full'), { record: sceneRecord, device });

      const report = build(readKeptCaptures(root));

      expect(report.captures[0].device).toMatchObject({
        model: 'pixel_xl',
        platform: 'android',
        osVersion: '12',
      });
    } finally {
      undo();
      vi.unstubAllEnvs();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('a kept incomplete scene is listed with its picture, as a scene that came up', () => {
    const [listed] = build([kept({ record: { ...sceneRecord, kind: 'incomplete' } })]).captures;

    expect(listed.picture).toBe('pictures//p/.sherlo/captures/x/screen.png');
    expect(listed.kind).toBe('scene');
    expect(listed.record.ready).toEqual({ ok: true, reached: 'Inbox › Full', rule: '' });
  });

  it('a never-reached capture gives the time it waited', () => {
    const waited = build([kept({ record: { ...neverReached, waitedMs: 4200 } })]).captures[0];
    const unknown = build([kept({ record: neverReached })]).captures[0];

    expect(waited.record.timings).toEqual({ totalMs: 4200 });
    expect(unknown.record.timings).toEqual({});
  });

  it("a capture's timings reach the report as whole milliseconds", () => {
    const record = {
      ...sceneRecord,
      bootMs: 100.25,
      reached: { route: ['Inbox', 'Full'], ms: 200.4507499999963 },
      settled: { ms: 300.6525420000035 },
    };
    const { timings } = build([kept({ record })]).captures[0].record;

    expect(timings).toEqual({ totalMs: 601, toReadyMs: 200, toStillMs: 301 });
  });

  it("a never-reached capture's wait reaches the report as whole milliseconds", () => {
    const record = { ...neverReached, waitedMs: 4200.893376 };
    const waited = build([kept({ record })]).captures[0];

    expect(waited.record.timings).toEqual({ totalMs: 4201 });
  });

  it('the plain data holds every fact the page shows', () => {
    const report = build([kept({ id: 'Inbox/Full' })], { capturingIds: ['Inbox/Full'] });

    expect(report).toEqual({
      summary: {
        capturedCount: 1,
        notCapturedCount: 0,
        changedCount: 0,
        isLive: false,
        lastCaptureAt: '09:30',
      },
      captures: [
        {
          id: 'Inbox/Full',
          kind: 'scene',
          device: { sherloDeviceId: 'iphone.15.pro' },
          picture: 'pictures//p/.sherlo/captures/x/screen.png',
          changed: false,
          capturing: true,
          record: {
            sceneId: 'Inbox/Full',
            ending: { kind: 'captured' },
            fakes: [],
            play: [{ ok: true, step: 'Tap send' }],
            ready: { ok: true, reached: 'Inbox › Full', rule: '' },
            start: { params: [], route: 'Inbox › Full', storedData: [] },
            timings: { totalMs: 600, toReadyMs: 200, toStillMs: 300 },
          },
        },
      ],
    });
  });
});
