/**
 * THE SAVE, AND THE CLEAN THAT FOLLOWS IT - the first half of ./deviceState.
 *
 * {@link saveDeviceState} only READS the device: the app's data and the two settings a clean
 * device changes go into the run's save folder, and a save that fails part way has changed
 * nothing. {@link cleanTheDevice} is the only code that changes the device, and it runs after the
 * whole save is in.
 *
 *     iOS      the app's container (Documents, Library, tmp), copied as files; Reduce Motion, read
 *              from the simulator's accessibility defaults; the notification settings, the
 *              simulator's own BulletinBoard file that `applesimutils` edits.
 *     Android  the app's data folder, as a tar the app's own user writes (`run-as`, so a debuggable
 *              build); the three animation scales; whether notifications are granted.
 */
import fs from 'fs';
import path from 'path';
import { deviceState } from './deviceState';
import type { SceneApp, SceneDevice } from './deviceState';

/** The parts of an iOS app's data container that hold the app's own data. */
export const IOS_DATA_PARTS = ['Documents', 'Library', 'tmp'] as const;

/** The three Android settings that animate, all set to 0 on a clean device. */
export const ANIMATION_SCALES = [
  'window_animation_scale',
  'transition_animation_scale',
  'animator_duration_scale',
] as const;

/** Where a simulator keeps every app's notification settings, under its own data folder. */
export const BULLETIN_BOARD = 'Library/BulletinBoard/VersionedSectionInfo.plist';

export const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS';

/** What one run saved, and where. `null` is a setting the device did not have before. */
export type SavedDevice =
  | {
      platform: 'ios';
      folder: string;
      container: string;
      /** The parts of the container that existed, each copied to `<folder>/data/<part>`. */
      parts: string[];
      reduceMotion: '1' | '0' | null;
      /** Whether the simulator had a BulletinBoard file, copied to `<folder>/bulletins.plist`. */
      hadBulletins: boolean;
      /** The user default `RCT_jsLocation` (where the app looks for the bundler) the app had, or null. */
      jsLocation: string | null;
    }
  | {
      platform: 'android';
      folder: string;
      /** The app's data folder, as a tar at this path. */
      dataTar: string;
      scales: Record<(typeof ANIMATION_SCALES)[number], string | null>;
      /** `not-asked`: the app does not ask for notifications on this Android, so nothing is changed. */
      notifications: 'granted' | 'not-granted' | 'not-asked';
      /**
       * The phone's `adb reverse` mappings, each `tcp:<on the phone> tcp:<on this machine>`; null
       * when the phone would not say, and then the restore touches no mapping.
       */
      reversed: string[] | null;
    };

/** Read everything a clean device changes into `folder`, changing nothing on the device. */
export async function saveDeviceState(
  device: SceneDevice,
  app: SceneApp,
  folder: string
): Promise<SavedDevice> {
  const { run, simulatorFolder } = deviceState();
  await stopTheApp(device, app);

  if (device.platform === 'ios') {
    const container = (
      await run('xcrun', ['simctl', 'get_app_container', device.udid, app.id, 'data'])
    ).trim();
    const parts = IOS_DATA_PARTS.filter((part) => fs.existsSync(path.join(container, part)));
    for (const part of parts) {
      fs.cpSync(path.join(container, part), path.join(folder, 'data', part), { recursive: true });
    }

    const bulletins = path.join(simulatorFolder(device.udid), BULLETIN_BOARD);
    const hadBulletins = fs.existsSync(bulletins);
    if (hadBulletins) fs.copyFileSync(bulletins, path.join(folder, 'bulletins.plist'));

    return {
      platform: 'ios',
      folder,
      container,
      parts,
      reduceMotion: await readReduceMotion(device.udid),
      hadBulletins,
      jsLocation: await readJsLocation(device.udid, app.id),
    };
  }

  const adb = (...args: string[]) => run('adb', ['-s', device.serial, ...args]);
  const dataTar = path.join(folder, 'data.tar');
  await run(
    'adb',
    ['-s', device.serial, 'exec-out', 'run-as', app.id, 'tar', '-cf', '-', '--exclude=./lib', '.'],
    { stdoutTo: dataTar }
  );

  const scales = {} as Record<(typeof ANIMATION_SCALES)[number], string | null>;
  for (const scale of ANIMATION_SCALES) {
    const value = (await adb('shell', 'settings', 'get', 'global', scale)).trim();
    scales[scale] = value === 'null' || value === '' ? null : value;
  }

  const granted = (await androidPermissionStates(device.serial, app))[POST_NOTIFICATIONS];
  const notifications =
    granted === true ? 'granted' : granted === false ? 'not-granted' : 'not-asked';

  return {
    platform: 'android',
    folder,
    dataTar,
    scales,
    notifications,
    reversed: await reverseMappings(adb),
  };
}

/** The phone's `adb reverse` mappings, each `tcp:<on the phone> tcp:<on this machine>`. */
export async function reverseMappings(
  adb: (...args: string[]) => Promise<string>
): Promise<string[] | null> {
  try {
    const listed = await adb('reverse', '--list');
    return [...listed.matchAll(/(tcp:\d+)\s+(tcp:\d+)/g)].map((match) => `${match[1]} ${match[2]}`);
  } catch {
    // The phone would not list its mappings: say so, never pass it off as an empty list.
    return null;
  }
}

/** Each runtime permission the app's manifest declares on an Android phone, and whether it is granted. */
export async function androidPermissionStates(
  serial: string,
  app: SceneApp
): Promise<Record<string, boolean>> {
  const dump = await deviceState().run('adb', [
    '-s',
    serial,
    'shell',
    'dumpsys',
    'package',
    app.id,
  ]);
  const states: Record<string, boolean> = {};
  for (const match of dump.matchAll(/(android\.permission\.[A-Z_]+): granted=(true|false)/g)) {
    states[match[1]] = match[2] === 'true';
  }
  return states;
}

/** Grant or deny the app's notifications on a simulator (`simctl privacy` has no such service). */
export async function setIosNotifications(
  udid: string,
  app: SceneApp,
  granted: boolean
): Promise<void> {
  await deviceState().run('applesimutils', [
    '--byId',
    udid,
    '--bundle',
    app.id,
    '--setPermissions',
    `notifications=${granted ? 'YES' : 'NO'}`,
  ]);
}

/** Wipe the app's data, grant notifications, and still the animations - only after the save. */
export async function cleanTheDevice(
  device: SceneDevice,
  app: SceneApp,
  saved: SavedDevice
): Promise<void> {
  const { run } = deviceState();

  if (device.platform === 'ios' && saved.platform === 'ios') {
    emptyTheContainer(saved.container, saved.parts);
    await setIosNotifications(device.udid, app, true);
    await run('xcrun', [
      'simctl',
      'spawn',
      device.udid,
      'defaults',
      'write',
      'com.apple.Accessibility',
      'ReduceMotionEnabled',
      '-bool',
      'true',
    ]);
    return;
  }

  if (device.platform === 'android' && saved.platform === 'android') {
    const adb = (...args: string[]) => run('adb', ['-s', device.serial, ...args]);
    await emptyTheAndroidData(device.serial, app);
    if (saved.notifications === 'not-granted') {
      await adb('shell', 'pm', 'grant', app.id, POST_NOTIFICATIONS);
    }
    for (const scale of ANIMATION_SCALES) {
      await adb('shell', 'settings', 'put', 'global', scale, '0');
    }
  }
}

/* ========================================================================== */

/** Close the app, so its data is not written while it is copied. */
export async function stopTheApp(device: SceneDevice, app: SceneApp): Promise<void> {
  const { run } = deviceState();
  if (device.platform === 'android') {
    await run('adb', ['-s', device.serial, 'shell', 'am', 'force-stop', app.id]);
    return;
  }
  try {
    await run('xcrun', ['simctl', 'terminate', device.udid, app.id]);
  } catch {
    // simctl refuses to terminate an app that is not running, which is the state wanted here.
  }
}

/** Empty each part of an iOS container, keeping the folders themselves. */
export function emptyTheContainer(container: string, parts: string[]): void {
  for (const part of parts) {
    const folder = path.join(container, part);
    if (!fs.existsSync(folder)) continue;
    for (const entry of fs.readdirSync(folder)) {
      fs.rmSync(path.join(folder, entry), { recursive: true, force: true });
    }
  }
}

/** Empty the app's Android data folder as the app's own user, keeping its native library link. */
export async function emptyTheAndroidData(serial: string, app: SceneApp): Promise<void> {
  await deviceState().run('adb', [
    '-s',
    serial,
    'shell',
    `run-as ${app.id} find . -mindepth 1 -maxdepth 1 ! -name lib -exec rm -rf {} +`,
  ]);
}

/**
 * The bundler address the app was told by hand. User defaults live in the simulator's preferences
 * daemon, which keeps its answer after the app's files are put back, so the restore sets this one
 * through the daemon too.
 */
async function readJsLocation(udid: string, appId: string): Promise<string | null> {
  try {
    const args = ['simctl', 'spawn', udid, 'defaults', 'read', appId, 'RCT_jsLocation'];
    return (await deviceState().run('xcrun', args)).trim() || null;
  } catch {
    // `defaults read` fails on a key the app never had.
    return null;
  }
}

async function readReduceMotion(udid: string): Promise<'1' | '0' | null> {
  try {
    const value = (
      await deviceState().run('xcrun', [
        'simctl',
        'spawn',
        udid,
        'defaults',
        'read',
        'com.apple.Accessibility',
        'ReduceMotionEnabled',
      ])
    ).trim();
    return value === '1' ? '1' : '0';
  } catch {
    // `defaults read` fails on a key the simulator never had: Reduce Motion was never set.
    return null;
  }
}
