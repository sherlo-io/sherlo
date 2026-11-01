/**
 * THE KEPT CAPTURES - the one place the layout of `.sherlo/captures/` is written and read.
 *
 *     .sherlo/captures/<ISO time>_<id>/record.json   the record `--json` prints, as it is
 *                                      screen.png    the picture, when there is one
 *                                      device.json   the device the capture ran on, when it is known
 *                                      capturing     an empty marker while the capture runs
 *
 * The folder's time uses `-` where an ISO time has `:`, so the name is a legal file name anywhere.
 * Nothing here reads a field of the record: whatever the record holds is kept and read back whole.
 */
import fs from 'fs';
import path from 'path';
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
 * Make the folder one capture is kept in, and mark it as being captured: the marker is an empty
 * file that `keepCapture` takes away, so a folder that still holds it is a capture running now.
 */
export function newCapture(root: string, id: string, now = new Date()): NewCapture {
  const time = now.toISOString().replace(/:/g, '-');
  const folder = path.join(root, CAPTURES_FOLDER, `${time}_${id.replace(/[^\w.-]/g, '-')}`);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, CAPTURING_FILE), '');
  return { folder, screenPath: path.join(folder, SCREEN_FILE) };
}

/** Write the record, and the device when it is known, into a capture's folder; the marker goes. */
export function keepCapture(
  capture: NewCapture,
  kept: { record: unknown; device?: LocalDevice }
): void {
  const write = (file: string, value: unknown) =>
    fs.writeFileSync(path.join(capture.folder, file), `${JSON.stringify(value, null, 2)}\n`);
  write(RECORD_FILE, kept.record);
  if (kept.device) write(DEVICE_FILE, kept.device);
  fs.rmSync(path.join(capture.folder, CAPTURING_FILE), { force: true });
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
      const marker = fs.statSync(path.join(captures, name, CAPTURING_FILE));
      return now - marker.mtimeMs < STALE_MARKER_MS ? [idOfFolder(name)] : [];
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
        return [
          {
            folder,
            // The folder's `2026-11-01T09-30-00.000Z` is the time `2026-11-01T09:30:00.000Z`.
            at: time.replace(/T(\d+)-(\d+)-/, 'T$1:$2:'),
            id: idOfFolder(name),
            record: read(RECORD_FILE),
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
