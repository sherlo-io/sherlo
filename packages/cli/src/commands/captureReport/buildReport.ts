/**
 * THE CAPTURE REPORT - what the local review page and `--json` read, built from the kept captures.
 *
 * Pure: the kept captures, the ids being captured now and a way to compare two pictures go in, the
 * report comes out. The page polls it from ./data/report.json; an agent reads it with `--json`.
 *
 * THE CONTRACT, copied from the frontend's apps/local-report/src/report.types.ts (change it there
 * and here together):
 *
 *   THE DATA FILE: ./data/report.json, beside the page. The CLI writes exactly this shape and the
 *   page polls it every second.
 *
 *   Report
 *     summary.capturedCount     number    captures that ended "captured"
 *     summary.notCapturedCount  number    captures that did not
 *     summary.changedCount      number    captures marked changed since the last run
 *     summary.lastCaptureAt     string?   clock time of the newest capture, "10:24"; absent before the first
 *     summary.isLive            boolean   the CLI is still running and will rewrite the file
 *     captures                  Capture[] one per scene or story per device
 *
 *   Capture
 *     id          string                 the scene's or story's id as its file names it: "Inbox/Full"
 *     kind        "scene" | "story"
 *     device      CaptureDevice
 *     picture     string                 the picture's path, relative to the page: "data/pictures/Inbox-Full.png"
 *     changed     boolean                looks different from the previous local run
 *     capturing   boolean                being captured again right now
 *     record      SceneDetailsRecord     the scene details panel's record (SceneDetails.types.ts)
 *
 *   CaptureDevice, one of
 *     { sherloDeviceId }                                            a Sherlo device ("iphone.15.pro"): drawn in its frame
 *     { model, platform, osVersion, screenWidth, screenHeight,      a local simulator Sherlo has no
 *       screenSizeInInches }                                        device for: drawn bare, rounded corners
 *
 * THE SCENE RECORD IS TODAY'S SHAPE. `record` is made of the fields the kept record.json carries
 * now; what it does not carry is left empty (no fakes, no start params, no stored data, no signed-in
 * member, no matched view) and the screen size in inches is 0. The final record shape comes later.
 *
 * A capture that never reached the app (no bundler, no app, no such scene, an app that kept
 * starting over) has no screen to show, so it is left out; the previous capture of that screen
 * stays the latest.
 */
import type { PlayStep } from '../../render/capturedScene';
import type { SceneEnding } from '../../render/capturedScene';
import type { CaptureResult } from '../../seams/captureSocket';
import type { KeptCapture } from '../../seams/localCaptures';
import type { LocalDevice } from '../../seams/localDevice';

export type Report = { captures: Capture[]; summary: ReportSummary };

export type ReportSummary = {
  capturedCount: number;
  changedCount: number;
  isLive: boolean;
  notCapturedCount: number;
  lastCaptureAt?: string;
};

export type Capture = {
  capturing: boolean;
  changed: boolean;
  device: CaptureDevice;
  id: string;
  kind: 'scene' | 'story';
  picture: string;
  record: SceneDetailsRecord;
};

export type CaptureDevice = { sherloDeviceId: string } | LocalSimulator;

export type LocalSimulator = {
  model: string;
  osVersion: string;
  /** Left out when the device could not be read: no system is claimed for a phone nobody read. */
  platform?: 'ios' | 'android';
  screenHeight: number;
  screenSizeInInches: number;
  screenWidth: number;
};

/** The frontend's SceneDetailsRecord (SceneDetails.types.ts), the part of it the page reads. */
export type SceneDetailsRecord = {
  ending: Ending;
  fakes: { answered: string[]; background: string[]; name: string; refused: string[] }[];
  play: { ok: boolean; step: string; note?: string }[];
  ready: { ok: boolean; reached: string; rule: string; matched?: string };
  sceneId: string;
  start: {
    params: { key: string; value: string }[];
    route: string;
    storedData: { key: string; value: string }[];
    member?: string;
  };
  timings: { totalMs?: number; toReadyMs?: number; toStillMs?: number };
};

type Ending =
  | { kind: 'captured' }
  | { kind: 'never-reached'; stayedOn: string }
  | { kind: 'never-settled'; stillMoving: string[] }
  | { at: string; error: string; kind: 'crashed-at-boot' }
  | { error: string; kind: 'crashed-mid-capture' }
  | { kind: 'play-target-missing'; step: string };

/** What building the report needs from the outside: the clock-free facts, and how to tell two pictures apart. */
export type ReportInput = {
  captures: KeptCapture[];
  /** The ids of the screens being captured now. */
  capturingIds: string[];
  /** Whether two kept pictures are the same bytes. */
  samePicture: (first: string, second: string) => boolean;
  /** The CLI keeps running and will rewrite the report. */
  isLive: boolean;
  /** How the picture of a capture is named in the report. */
  pictureOf: (capture: KeptCapture) => string;
  /** The time zone the clock time is told in; absent, this computer's own. */
  timeZone?: string;
};

/** The report: the latest capture of each screen on each device, the failed ones first. */
export function buildReport({
  captures,
  capturingIds,
  samePicture,
  isLive,
  pictureOf,
  timeZone,
}: ReportInput): Report {
  const seen = captures.filter((capture) => reading(capture) !== undefined);
  const latest = new Map<string, KeptCapture>();
  const previous = new Map<string, KeptCapture>();
  // Oldest first: a later capture of the same screen on the same device takes the place of the one before it.
  for (const capture of seen) {
    const key = `${capture.id}\n${deviceKey(capture.device)}`;
    const before = latest.get(key);
    if (before) previous.set(key, before);
    latest.set(key, capture);
  }

  const shown = [...latest].map(([key, capture]): Capture => {
    const earlier = previous.get(key);
    const reported = reading(capture);
    return {
      id: capture.id,
      kind: reported?.kind ?? 'scene',
      device: captureDevice(capture.device, reported?.screen),
      picture: capture.screenPath ? pictureOf(capture) : '',
      changed: Boolean(
        earlier?.screenPath &&
        capture.screenPath &&
        !samePicture(earlier.screenPath, capture.screenPath)
      ),
      capturing: capturingIds.includes(capture.id),
      record: reported!.record,
    };
  });

  const captured = (shownCapture: Capture) => shownCapture.record.ending.kind === 'captured';
  shown.sort(
    (a, b) =>
      Number(captured(a)) - Number(captured(b)) ||
      a.id.localeCompare(b.id) ||
      JSON.stringify(a.device).localeCompare(JSON.stringify(b.device))
  );

  const newest = seen.length > 0 ? seen[seen.length - 1] : undefined;
  return {
    captures: shown,
    summary: {
      capturedCount: shown.filter(captured).length,
      notCapturedCount: shown.filter((shownCapture) => !captured(shownCapture)).length,
      changedCount: shown.filter((shownCapture) => shownCapture.changed).length,
      isLive,
      ...(newest && { lastCaptureAt: clockTime(newest.at, timeZone) }),
    },
  };
}

/** "10:24" - the capture's time on this computer's clock, or on `timeZone`'s when one is named. */
function clockTime(iso: string, timeZone: string | undefined): string {
  const time = (zone: string | undefined) =>
    new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: zone,
    });
  try {
    return time(timeZone);
  } catch {
    // `TZ` may be empty or a POSIX rule such as `CET-1`, which are not zone names: use this computer's own.
    return time(undefined);
  }
}

function deviceKey(device: LocalDevice | undefined): string {
  return JSON.stringify(device ?? null);
}

/** `deviceId` names a Sherlo device; any other device is a local simulator, drawn bare. */
function captureDevice(
  device: LocalDevice | undefined,
  screen: { width: number; height: number } | undefined
): CaptureDevice {
  if (device && 'deviceId' in device) return { sherloDeviceId: device.deviceId };
  const system = device?.os ?? '';
  return {
    model: device && 'local' in device ? device.model : 'Unknown device',
    ...(system.startsWith('Android') && { platform: 'android' as const }),
    ...(system.startsWith('iOS') && { platform: 'ios' as const }),
    osVersion: system.replace(/^\S+\s*/, ''),
    screenWidth: screen?.width ?? 0,
    screenHeight: screen?.height ?? 0,
    screenSizeInInches: 0,
  };
}

/* ========================================================================== */
/* The record: what one kept record.json says, in the page's words            */
/* ========================================================================== */

type Reading = {
  kind: 'scene' | 'story';
  record: SceneDetailsRecord;
  screen?: { width: number; height: number };
};

const SEPARATOR = ' › ';

/** What a kept record says about the screen, or nothing when the app never showed one. */
function reading(capture: KeptCapture): Reading | undefined {
  const said = capture.record as ((SceneEnding & { waitedMs?: number }) | CaptureResult) | null;
  const sceneId = capture.id;
  const empty = { fakes: [], sceneId, start: { params: [], route: '', storedData: [] } };

  switch (said?.kind) {
    case 'scene': {
      const route = said.reached.route.join(SEPARATOR);
      return {
        kind: 'scene',
        screen: said.tree.size,
        record: {
          ...empty,
          ending: { kind: 'captured' },
          play: said.play.map((step) => ({ ok: true, step: stepText(step) })),
          ready: { ok: true, reached: route, rule: '' },
          start: { ...empty.start, route },
          timings: {
            totalMs: said.bootMs + said.reached.ms + said.settled.ms,
            toReadyMs: said.reached.ms,
            toStillMs: said.settled.ms,
          },
        },
      };
    }
    case 'never-reached': {
      const stayedOn = said.stayedOn.join(SEPARATOR);
      return {
        kind: 'scene',
        record: {
          ...empty,
          ending: { kind: 'never-reached', stayedOn },
          play: [],
          ready: { ok: false, reached: stayedOn, rule: said.ready },
          // The time the capture waited before it gave up, as the command timed it; a record without it names none.
          timings: typeof said.waitedMs === 'number' ? { totalMs: said.waitedMs } : {},
        },
      };
    }
    case 'play-target-missing': {
      const route = said.route.join(SEPARATOR);
      return {
        kind: 'scene',
        record: {
          ...empty,
          ending: { kind: 'play-target-missing', step: stepText(said.missing) },
          play: [
            ...said.done.map((step) => ({ ok: true, step: stepText(step) })),
            { ok: false, step: stepText(said.missing) },
          ],
          ready: { ok: false, reached: route, rule: '' },
          start: { ...empty.start, route },
          timings: {},
        },
      };
    }
    case 'crashed-at-boot':
      return failed('scene', empty, {
        kind: 'crashed-at-boot',
        at: `${said.error.file}:${said.error.line}`,
        error: `${said.error.name}: ${said.error.message}`,
      });
    case 'crashed-mid-capture':
      return failed('scene', empty, {
        kind: 'crashed-mid-capture',
        error: said.error ? `${said.error.name}: ${said.error.message}` : 'The app crashed',
      });
    case 'crashed':
      return failed('story', empty, {
        kind: 'crashed-mid-capture',
        error: said.error ? `${said.error.name}: ${said.error.message}` : 'The app crashed',
      });
    case 'captured': {
      const story = { ...empty, sceneId: said.storyId };
      const settledMs = said.settled === 'timed-out' ? undefined : said.settled.ms;
      const ending: Ending = said.threw
        ? { kind: 'crashed-mid-capture', error: `${said.threw.name}: ${said.threw.message}` }
        : said.settled === 'timed-out'
          ? { kind: 'never-settled', stillMoving: said.changing ?? [] }
          : { kind: 'captured' };
      return {
        kind: 'story',
        screen: said.tree.size,
        record: {
          ...story,
          ending,
          play: [],
          ready: { ok: ending.kind === 'captured', reached: '', rule: '' },
          timings: {
            ...(settledMs !== undefined && { totalMs: settledMs, toStillMs: settledMs }),
          },
        },
      };
    }
    default:
      return undefined;
  }
}

/** A capture that ended before the screen was read: it has an ending and nothing else to say. */
function failed(
  kind: Reading['kind'],
  empty: Pick<SceneDetailsRecord, 'fakes' | 'sceneId' | 'start'>,
  ending: Ending
): Reading {
  return {
    kind,
    record: {
      ...empty,
      ending,
      play: [],
      ready: { ok: false, reached: '', rule: '' },
      timings: {},
    },
  };
}

/** A play step in words: what was done, and to which view. */
function stepText(step: PlayStep): string {
  if ('tap' in step) return `Tap ${step.tap}`;
  if ('longPress' in step) return `Long-press ${step.longPress}`;
  if ('type' in step) return `Type into ${step.type}`;
  if ('swipe' in step) return `Swipe ${step.direction} on ${step.swipe}`;
  return `Open ${step.open}`;
}
