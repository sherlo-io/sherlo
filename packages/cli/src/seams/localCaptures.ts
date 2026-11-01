/**
 * THE KEPT CAPTURES - the one place the layout of `.sherlo/captures/` is written and read.
 *
 *     .sherlo/captures/<ISO time>_<id>/record.json   the record `--json` prints, as it is
 *                                      screen.png    the picture, when there is one
 *                                      device.json   the device the capture ran on, when it is known
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

/** Make the folder one capture is kept in. */
export function newCapture(root: string, id: string, now = new Date()): NewCapture {
  const time = now.toISOString().replace(/:/g, '-');
  const folder = path.join(root, CAPTURES_FOLDER, `${time}_${id.replace(/[^\w.-]/g, '-')}`);
  fs.mkdirSync(folder, { recursive: true });
  return { folder, screenPath: path.join(folder, SCREEN_FILE) };
}

/** Write the record, and the device when it is known, into a capture's folder. */
export function keepCapture(
  capture: NewCapture,
  kept: { record: unknown; device?: LocalDevice }
): void {
  const write = (file: string, value: unknown) =>
    fs.writeFileSync(path.join(capture.folder, file), `${JSON.stringify(value, null, 2)}\n`);
  write(RECORD_FILE, kept.record);
  if (kept.device) write(DEVICE_FILE, kept.device);
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
      const [time, ...id] = name.split('_');
      const read = (file: string) => JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
      const screenPath = path.join(folder, SCREEN_FILE);
      return [
        {
          folder,
          // The folder's `2026-11-01T09-30-00.000Z` is the time `2026-11-01T09:30:00.000Z`.
          at: time.replace(/T(\d+)-(\d+)-/, 'T$1:$2:'),
          id: id.join('_'),
          record: read(RECORD_FILE),
          ...(fs.existsSync(screenPath) && { screenPath }),
          ...(fs.existsSync(path.join(folder, DEVICE_FILE)) && {
            device: read(DEVICE_FILE) as LocalDevice,
          }),
        },
      ];
    });
}
