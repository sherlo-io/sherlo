/**
 * THE SCENE'S PHONE - the permissions and the location a scene file declares in its `device` field,
 * set on the developer's own phone before the scene launches and put back after.
 *
 * Nothing here fails a capture: a permission or a location the phone cannot take (an Android app
 * whose manifest does not declare the permission, a real phone that cannot be sent a location, an
 * emulator whose earlier location cannot be read) is answered as NOT APPLIED, and the capture
 * carries on. A scene with no `device` field runs no command.
 *
 * THE PHONE IS PUT BACK AS IT WAS. The clean device (./deviceStateSave) resets the app's data and
 * the notification grant, never the other permissions, so what this module changes it saves first:
 *
 *     iOS      the simulator's privacy database (TCC) is copied, and copied back after; the
 *              location is cleared (`simctl` cannot read an earlier one).
 *     Android  each permission's earlier grant is read and set back; an emulator's earlier location
 *              is read from `dumpsys location` and set back.
 */
import fs from 'fs';
import path from 'path';
import type {
  SceneDevice as SceneDeviceField,
  ScenePermission,
} from '../../../react-native-storybook/metro/sceneFiles';
import { deviceState } from './deviceState';
import type { SceneApp, SceneDevice } from './deviceState';
import {
  POST_NOTIFICATIONS,
  androidPermissionStates,
  setIosNotifications,
} from './deviceStateSave';

/** The SDK's reader of scene files: a plain script that parses source, so it loads only when asked. */
function sceneFiles(): typeof import('../../../react-native-storybook/metro/sceneFiles') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../../react-native-storybook/metro/sceneFiles');
}

export type { SceneDeviceField };

/** Each scene permission by the name each platform gives it: the one table. */
const PLATFORM_NAMES: Record<ScenePermission, { ios: string; android: string[] }> = {
  camera: { ios: 'camera', android: ['android.permission.CAMERA'] },
  microphone: { ios: 'microphone', android: ['android.permission.RECORD_AUDIO'] },
  photos: {
    ios: 'photos',
    android: ['android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_EXTERNAL_STORAGE'],
  },
  contacts: { ios: 'contacts', android: ['android.permission.READ_CONTACTS'] },
  location: {
    ios: 'location',
    android: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
  },
  // iOS notifications are set with `applesimutils`, not `simctl privacy`.
  notifications: { ios: 'notifications', android: [POST_NOTIFICATIONS] },
  calendar: { ios: 'calendar', android: ['android.permission.READ_CALENDAR'] },
};

/** The simulator's privacy database and the files SQLite keeps beside it. */
const TCC_FOLDER = 'Library/TCC';
const TCC_FILES = ['TCC.db', 'TCC.db-wal', 'TCC.db-shm'];

/** What was changed for one scene, so the put-back knows what to undo. */
export type SavedSceneDevice = {
  /** iOS: the privacy database files copied to `<folder>/tcc`, when the scene sets a permission. */
  iosTcc: string[];
  /** iOS: whether a location was set, to be cleared. */
  iosLocation: boolean;
  /** Android: each permission the scene touches, with whether it was granted before. */
  androidWas: Record<string, boolean>;
  /** Android emulator: where the phone was before the scene moved it. */
  androidLocation?: { latitude: number; longitude: number };
};

/** Every scene id the project's scene files make. */
export function sceneIdsOf(root: string): string[] {
  return Object.keys(sceneFiles().scenesOfProject(root));
}

/** The scene's device as its file declares it, or undefined when the file declares none. */
export function deviceOfScene(root: string, sceneId: string): SceneDeviceField | undefined {
  const files = sceneFiles();
  const scene = files.scenesOfProject(root)[sceneId];
  if (!scene) return undefined;
  const devices = files.sceneDevicesOf(
    path.basename(scene.file),
    fs.readFileSync(scene.file, 'utf8')
  );
  const device = devices[scene.key];
  return device && Object.keys(device).length > 0 ? device : undefined;
}

/** Read what the scene's device will change into `folder`, changing nothing on the phone. */
export async function saveSceneDevice(
  device: SceneDevice,
  app: SceneApp,
  field: SceneDeviceField,
  folder: string
): Promise<SavedSceneDevice> {
  const saved: SavedSceneDevice = { iosTcc: [], iosLocation: false, androidWas: {} };
  const named = Object.keys(field.permissions ?? {}) as ScenePermission[];
  if (device.platform === 'ios') {
    if (named.some((name) => name !== 'notifications')) {
      // The notification grant is the clean device's own save (the BulletinBoard file).
      const tcc = path.join(deviceState().simulatorFolder(device.udid), TCC_FOLDER);
      saved.iosTcc = TCC_FILES.filter((file) => fs.existsSync(path.join(tcc, file)));
      for (const file of saved.iosTcc) {
        fs.mkdirSync(path.join(folder, 'tcc'), { recursive: true });
        fs.copyFileSync(path.join(tcc, file), path.join(folder, 'tcc', file));
      }
    }
    saved.iosLocation = field.location !== undefined;
    return saved;
  }
  const states = await androidPermissionStates(device.serial, app);
  for (const name of named) {
    for (const permission of PLATFORM_NAMES[name].android) {
      if (permission in states) saved.androidWas[permission] = states[permission];
    }
  }
  if (field.location && isEmulator(device.serial)) {
    saved.androidLocation = await androidLocation(device.serial);
  }
  return saved;
}

/** Set the scene's permissions and location; answers what the phone could not take. */
export async function applySceneDevice(
  target: { device: SceneDevice; app: SceneApp },
  field: SceneDeviceField | undefined
): Promise<string[]> {
  const notApplied = new Set<string>();
  if (!field) return [];
  const { run } = deviceState();
  const { device, app } = target;
  const attempt = async (name: string, act: () => Promise<unknown>) => {
    try {
      await act();
    } catch {
      // The phone refused this one: it is listed as not applied and the capture goes on.
      notApplied.add(name);
    }
  };

  const android =
    device.platform === 'android' ? await androidPermissionStates(device.serial, app) : {};
  for (const [name, state] of Object.entries(field.permissions ?? {}) as Array<
    [ScenePermission, 'granted' | 'denied']
  >) {
    if (device.platform === 'ios') {
      await attempt(name, () =>
        name === 'notifications'
          ? setIosNotifications(device.udid, app, state === 'granted')
          : run('xcrun', [
              'simctl',
              'privacy',
              device.udid,
              state === 'granted' ? 'grant' : 'revoke',
              PLATFORM_NAMES[name].ios,
              app.id,
            ])
      );
      continue;
    }
    // A permission the app's manifest does not declare cannot be granted or revoked.
    const declared = PLATFORM_NAMES[name].android.filter((permission) => permission in android);
    if (declared.length === 0) notApplied.add(name);
    for (const permission of declared) {
      await attempt(name, () =>
        run('adb', [
          '-s',
          device.serial,
          'shell',
          'pm',
          state === 'granted' ? 'grant' : 'revoke',
          app.id,
          permission,
        ])
      );
    }
  }

  const { location } = field;
  if (location) {
    if (device.platform === 'ios') {
      await attempt('location', () =>
        run('xcrun', [
          'simctl',
          'location',
          device.udid,
          'set',
          `${location.latitude},${location.longitude}`,
        ])
      );
    } else if (isEmulator(device.serial) && (await androidLocation(device.serial))) {
      await attempt('location', () => geoFix(device.serial, location));
    } else {
      // A real phone cannot be sent a location by adb, and an emulator whose earlier location
      // cannot be read could not be put back: neither is moved.
      notApplied.add('location');
    }
  }
  return [...notApplied];
}

/** Put back what {@link applySceneDevice} changed; answers what could not be put back. */
export async function restoreSceneDevice(
  device: SceneDevice,
  app: SceneApp,
  saved: SavedSceneDevice,
  folder: string
): Promise<string[]> {
  const { run } = deviceState();
  const failures: string[] = [];
  const step = async (what: string, act: () => Promise<unknown>) => {
    try {
      await act();
    } catch (error) {
      failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  if (device.platform === 'ios') {
    if (saved.iosTcc.length > 0) {
      await step('the permissions', async () => {
        const tcc = path.join(deviceState().simulatorFolder(device.udid), TCC_FOLDER);
        for (const file of TCC_FILES) fs.rmSync(path.join(tcc, file), { force: true });
        for (const file of saved.iosTcc) {
          fs.copyFileSync(path.join(folder, 'tcc', file), path.join(tcc, file));
        }
        // The permissions daemon reads the file when it starts; launchd starts it again at once.
        await run('xcrun', ['simctl', 'spawn', device.udid, 'launchctl', 'stop', 'com.apple.tccd']);
      });
    }
    if (saved.iosLocation) {
      await step('the location', () => run('xcrun', ['simctl', 'location', device.udid, 'clear']));
    }
    return failures;
  }
  for (const [permission, wasGranted] of Object.entries(saved.androidWas)) {
    await step(permission, () =>
      run('adb', [
        '-s',
        device.serial,
        'shell',
        'pm',
        wasGranted ? 'grant' : 'revoke',
        app.id,
        permission,
      ])
    );
  }
  const was = saved.androidLocation;
  if (was) await step('the location', () => geoFix(device.serial, was));
  return failures;
}

function isEmulator(serial: string): boolean {
  return serial.startsWith('emulator-');
}

function geoFix(serial: string, at: { latitude: number; longitude: number }): Promise<string> {
  return deviceState().run('adb', [
    '-s',
    serial,
    'emu',
    'geo',
    'fix',
    String(at.longitude),
    String(at.latitude),
  ]);
}

/** Where the emulator's phone is now, as `dumpsys location` last saw it; undefined when it says none. */
async function androidLocation(
  serial: string
): Promise<{ latitude: number; longitude: number } | undefined> {
  const dump = await deviceState().run('adb', ['-s', serial, 'shell', 'dumpsys', 'location']);
  const at = /Location\[\w+ (-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(dump);
  return at ? { latitude: Number(at[1]), longitude: Number(at[2]) } : undefined;
}
