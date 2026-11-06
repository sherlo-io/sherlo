/**
 * THE KEPT CAPTURES - the one place the layout of `.sherlo/captures/` is written and read.
 *
 *     .sherlo/captures/<ISO time>_<id>/record.json   the record `--json` prints, as it is
 *                                      screen.png    the picture, when there is one
 *                                      device.json   the device the capture ran on, when it is known
 *                                      capturing     a marker while the capture runs; it holds the id
 *
 * The folder's time uses `-` where an ISO time has `:`, so the name is a legal file name anywhere.
 * The record is kept and read back whole; only its `sceneId` (or `storyId`) is read, to tell the id
 * as it was given, because the folder's name has the id cleaned (`Inbox/Full` is `Inbox-Full` there).
 */
import fs from 'fs';
import path from 'path';
import { EXIT_SIGINT, EXIT_SIGTERM } from '../helpers/exitCodes';
import type { SceneLeft } from '../render/capturedScene';
import { ENDING_WORDS } from '../render/sinceLastRunLines';
import type { LocalDevice } from './localDevice';

export const CAPTURES_FOLDER = path.join('.sherlo', 'captures');
const RECORD_FILE = 'record.json';
const SCREEN_FILE = 'screen.png';
const DEVICE_FILE = 'device.json';
const CAPTURING_FILE = 'capturing';
const STALE_MARKER_MS = 15 * 60 * 1000;

/** One capture's folder, made and waiting to be filled. */
export type NewCapture = { folder: string; screenPath: string };

/** One kept capture, read back. */
export type KeptCapture = {
  folder: string;
  /** The time the capture started, ISO. */
  at: string;
  /** The story or scene id. */
  id: string;
  record: unknown;
  /** The picture's path, when the capture kept one. */
  screenPath?: string;
  device?: LocalDevice;
};

/**
 * Make the folder one capture is kept in, and mark it as being captured: the marker is a file,
 * holding the id as given, that `keepCapture` takes away, so a folder that still holds it is a
 * capture running now.
 */
export function newCapture(root: string, id: string, now = new Date()): NewCapture {
  const time = now.toISOString().replace(/:/g, '-');
  const folder = path.join(root, CAPTURES_FOLDER, `${time}_${id.replace(/[^\w.-]/g, '-')}`);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, CAPTURING_FILE), id);
  return { folder, screenPath: path.join(folder, SCREEN_FILE) };
}

/**
 * Write the device when it is known, then the record, into a capture's folder; the marker goes.
 * The record comes last, so a folder that holds a record is complete.
 */
export function keepCapture(
  capture: NewCapture,
  kept: { record: unknown; device?: LocalDevice }
): void {
  const write = (file: string, value: unknown) =>
    fs.writeFileSync(path.join(capture.folder, file), `${JSON.stringify(value, null, 2)}\n`);
  if (kept.device) write(DEVICE_FILE, kept.device);
  write(RECORD_FILE, kept.record);
  fs.rmSync(path.join(capture.folder, CAPTURING_FILE), { force: true });
}

/** Take a capture that did not end in a record away, marker and all; nothing of it is listed. */
export function dropCapture(capture: NewCapture): void {
  fs.rmSync(capture.folder, { recursive: true, force: true });
}

/**
 * Run what fills a capture's folder, and drop the folder on every way out that keeps no record: a
 * throw, or Ctrl+C / a terminate signal. The signal drops the folder first; it then ends the
 * process itself only when no other handler (the device's put-back) is there to do it.
 */
export async function guardCapture<T>(
  capture: NewCapture | undefined,
  run: () => Promise<T>
): Promise<T> {
  if (!capture) return run();
  const exitCodes = { SIGINT: EXIT_SIGINT, SIGTERM: EXIT_SIGTERM } as const;
  const handlers = (Object.keys(exitCodes) as (keyof typeof exitCodes)[]).map((signal) => {
    const handler = () => {
      dropCapture(capture);
      if (process.listenerCount(signal) === 1) process.exit(exitCodes[signal]);
    };
    process.on(signal, handler);
    return [signal, handler] as const;
  });
  try {
    return await run();
  } catch (error) {
    dropCapture(capture);
    throw error;
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  }
}

/**
 * The ids being captured right now: those whose folder still holds the marker. A capture that was
 * killed leaves its marker behind, so a marker older than `STALE_MARKER_MS` no longer counts.
 */
export function readCapturingIds(root: string, now = Date.now()): string[] {
  const captures = path.join(root, CAPTURES_FOLDER);
  if (!fs.existsSync(captures)) return [];
  return fs.readdirSync(captures).flatMap((name) => {
    try {
      const markerFile = path.join(captures, name, CAPTURING_FILE);
      if (now - fs.statSync(markerFile).mtimeMs >= STALE_MARKER_MS) return [];
      // The marker holds the id as given; one that holds nothing falls back to the folder's name.
      return [fs.readFileSync(markerFile, 'utf8') || idOfFolder(name)];
    } catch {
      // No marker in this folder (or the entry is not a folder): it is not being captured.
      return [];
    }
  });
}

/** Whether two kept pictures are the same bytes; a picture that cannot be read is not the same. */
export function samePicture(first: string, second: string): boolean {
  try {
    return fs.readFileSync(first).equals(fs.readFileSync(second));
  } catch {
    return false;
  }
}

/** The story or scene id a capture folder's name carries after its time. */
function idOfFolder(name: string): string {
  return name.split('_').slice(1).join('_');
}

/**
 * The id a record names itself by: `sceneId` for a scene, `storyId` for a story that reached the
 * app. An ending that never reached one (no bundler, no app, no such story) names neither, and
 * only that capture falls back to the folder's cleaned name.
 */
function idOfRecord(record: unknown): string | undefined {
  const named = record as { sceneId?: unknown; storyId?: unknown } | null;
  const id = named?.sceneId ?? named?.storyId;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

/** Every kept capture of the project, oldest first; a folder that is not a capture is left out. */
export function readKeptCaptures(root: string): KeptCapture[] {
  const captures = path.join(root, CAPTURES_FOLDER);
  if (!fs.existsSync(captures)) return [];
  return fs
    .readdirSync(captures)
    .sort()
    .flatMap((name): KeptCapture[] => {
      const folder = path.join(captures, name);
      if (!fs.existsSync(path.join(folder, RECORD_FILE))) return [];
      const time = name.split('_')[0];
      const read = (file: string) => JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
      const screenPath = path.join(folder, SCREEN_FILE);
      try {
        const record = read(RECORD_FILE);
        return [
          {
            folder,
            // The folder's `2026-11-01T09-30-00.000Z` is the time `2026-11-01T09:30:00.000Z`.
            at: time.replace(/T(\d+)-(\d+)-/, 'T$1:$2:'),
            id: idOfRecord(record) ?? idOfFolder(name),
            record,
            ...(fs.existsSync(screenPath) && { screenPath }),
            ...(fs.existsSync(path.join(folder, DEVICE_FILE)) && {
              device: read(DEVICE_FILE) as LocalDevice,
            }),
          },
        ];
      } catch {
        // A file being written right now (or left corrupt) reads half: that capture is left out,
        // so the review page, which polls while captures are written, never fails on it.
        return [];
      }
    });
}

type LastRun = NonNullable<SceneLeft['lastRun']>;

/** The endings a scene can be compared by, from the one that got least far to the one that got furthest. */
const FURTHEST_LAST: LastRun['ending'][] = ['never-reached', 'never-settled', 'captured'];

/**
 * How the scene ended the last time it was kept, set against how it ended now. `lastRun` is that
 * earlier ending; `change` is one line saying so when the scene got less far than it did, and
 * nothing when it got as far or further, or has no kept run to compare with.
 */
export function changeSinceLastKeptRun(
  root: string,
  sceneId: string,
  now: LastRun
): { lastRun?: LastRun; change?: string } {
  const last = readKeptCaptures(root)
    .filter((kept) => kept.id === sceneId)
    .map((kept) => lastRunOf(kept.record))
    .filter((run): run is LastRun => run !== undefined)
    .pop();
  if (!last) return {};
  const gotLessFar = FURTHEST_LAST.indexOf(now.ending) < FURTHEST_LAST.indexOf(last.ending);
  return {
    lastRun: last,
    ...(gotLessFar && {
      change: `${sceneId} got less far than its last kept run: was ${ENDING_WORDS[last.ending]} on ${last.route.join(' › ')}, now ${ENDING_WORDS[now.ending]} on ${now.route.join(' › ')}`,
    }),
  };
}

/** Whether an ending is a scene that came up and kept its picture, whether or not a request was refused. */
export function sceneCameUp<Answer extends { kind?: string }>(
  answer: Answer | null | undefined
): answer is Extract<Answer, { kind: 'scene' | 'incomplete' }> {
  return answer?.kind === 'scene' || answer?.kind === 'incomplete';
}

/** How an ending stands with the picture: captured, ended on the red error screen, or not captured at all. */
export type PictureEnding = 'captured' | 'threw' | 'not-captured';

/**
 * Whether a capture's frame is saved as the scene's picture, and what stands in its place when it
 * is not. Only a scene that came up and threw nothing is captured; a scene that ended on the red
 * error screen is flagged threw, and every other ending is not-captured. Neither saves its frame:
 * the scene keeps the picture of its last captured run, whose path comes back as lastPicture.
 */
export function pictureKeptFor(
  root: string,
  id: string,
  ending: { kind?: string; threw?: unknown }
): { saves: boolean; ending: PictureEnding; lastPicture?: string } {
  const threw = (ending as { threw?: unknown }).threw;
  const how: PictureEnding = !sceneCameUp(ending) ? 'not-captured' : threw ? 'threw' : 'captured';
  if (how === 'captured') return { saves: true, ending: how };
  const lastPicture = readKeptCaptures(root)
    .filter((kept) => kept.id === id && kept.screenPath)
    .pop()?.screenPath;
  return { saves: false, ending: how, ...(lastPicture && { lastPicture }) };
}

/** How a kept record or a fresh answer ended; nothing for one that is not a scene's, or ended another way. */
export function lastRunOf(record: unknown): LastRun | undefined {
  const kept = record as {
    kind?: string;
    reached?: { route?: string[] };
    stayedOn?: string[];
    unanswered?: unknown[];
  } | null;
  const ending = sceneCameUp(kept) ? 'captured' : kept?.kind;
  if (ending !== 'captured' && ending !== 'never-settled' && ending !== 'never-reached') {
    return undefined;
  }
  return {
    ending,
    route: kept?.reached?.route ?? kept?.stayedOn ?? [],
    refused: kept?.unanswered?.length ?? 0,
  };
}
