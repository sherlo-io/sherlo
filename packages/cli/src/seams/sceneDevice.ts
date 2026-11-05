/**
 * THE SCENE'S PHONE - what a scene file's `given` list says of the phone (its permissions, its
 * location, its member), set on the developer's own phone before the scene launches and put back
 * after.
 *
 * EVERY PERMISSION THE APP DECLARES IS ANSWERED (./declaredPermissions): granted, unless the scene
 * denies it, or the member is on a fresh install and so is shown the dialog (the permission is
 * reset). The iOS tracking prompt is a row of the simulator's privacy store, written before launch.
 * The member is set the same way: a signed-out scene has the app's stored logins wiped and the
 * rest of its data kept; a fresh-install scene has its data and logins wiped.
 *
 * Nothing here fails a capture: a setting the phone cannot take (an Android app whose manifest does
 * not declare the permission, a real phone that cannot be sent a location, an emulator whose earlier
 * location cannot be read) is answered as NOT APPLIED with why, and the capture carries on.
 *
 * THE PHONE IS PUT BACK AS IT WAS. The clean device (./deviceStateSave) resets the app's data and
 * the notification grant, never the other permissions, so what this module changes it saves first:
 *
 *     iOS      the simulator's privacy database (TCC) is copied, and copied back after; so is its
 *              keychain when the member is set; the location is cleared (`simctl` cannot read an
 *              earlier one).
 *     Android  each runtime permission's earlier grant is read and set back (no other kind can be
 *              granted); an emulator's earlier location is read from `dumpsys location` and set back.
 */
import fs from 'fs';
import path from 'path';
import type {
  ScenePermission,
  ScenePhone as SceneDeviceField,
} from '../../../react-native-storybook/metro/sceneFiles';
import type { SceneLeft } from '../render/capturedScene';
import { PLATFORM_NAMES } from './declaredPermissions';
import type { DeclaredPermissions } from './declaredPermissions';
import { deviceState } from './deviceState';
import type { SceneApp, SceneDevice } from './deviceState';
import { androidPermissionStates, setIosNotifications } from './deviceStateSave';

/** The SDK's reader of scene files: a plain script that parses source, so it loads only when asked. */
function sceneFiles(): typeof import('../../../react-native-storybook/metro/sceneFiles') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../../react-native-storybook/metro/sceneFiles');
}

export type { SceneDeviceField };

/** The scene's phone settings and what the app declares: everything {@link applySceneDevice} sets. */
export type PhoneToSet = SceneDeviceField & { declared?: DeclaredPermissions };

/** A setting the phone could not take, with why: the shape the capture screen lists. */
export type PhoneNotApplied = NonNullable<SceneLeft['phoneNotApplied']>[number];

/** How a permission is set: granted, denied, or reset so the app's dialog shows. */
type Answer = 'granted' | 'denied' | 'reset';

/** The simulator's privacy database and the files SQLite keeps beside it. */
const TCC_FOLDER = 'Library/TCC';
const TCC_FILES = ['TCC.db', 'TCC.db-wal', 'TCC.db-shm'];

/** The simulator's keychain and the files SQLite keeps beside it. */
const KEYCHAIN_FOLDER = 'Library/Keychains';
const KEYCHAIN_FILES = ['keychain-2.db', 'keychain-2.db-wal', 'keychain-2.db-shm'];

/** What was changed for one scene, so the put-back knows what to undo. */
export type SavedSceneDevice = {
  /** iOS: the privacy database files copied to `<folder>/tcc`. */
  iosTcc: string[];
  /** iOS: the keychain files copied to `<folder>/keychain`, when the member is set. */
  iosKeychain: string[];
  /** iOS: whether a location was set, to be cleared. */
  iosLocation: boolean;
  /** Android: each permission the scene touches, with whether it was granted before. */
  androidWas: Record<string, boolean>;
  /** Android emulator: where the phone was before the scene moved it. */
  androidLocation?: { latitude: number; longitude: number };
};

/** Every scene id the app declares, in the order its files declare them. */
export function sceneIdsOfApp(root: string): string[] {
  return sceneFiles().readSceneIds(root);
}

/** The scene's phone as its file declares it, or undefined when the file declares none. */
export function deviceOfScene(root: string, sceneId: string): SceneDeviceField | undefined {
  const files = sceneFiles();
  const scene = files.scenesOfProject(root)[sceneId];
  if (!scene) return undefined;
  // The full path, so a `given` list that imports a shared precondition file resolves.
  const devices = files.sceneDevicesOf(scene.file, fs.readFileSync(scene.file, 'utf8'));
  const device = devices[scene.key];
  return device && Object.keys(device).length > 0 ? device : undefined;
}

/** Each permission the phone will set for the scene, and how: the scene's own, else granted or reset. */
export function permissionsToSet(phone: PhoneToSet): Array<[ScenePermission, Answer]> {
  const named = phone.permissions ?? {};
  const unnamed: Answer = phone.member === 'fresh-install' ? 'reset' : 'granted';
  const names = new Set([...(phone.declared?.permissions ?? []), ...Object.keys(named)]);
  return [...names].map((name) => [
    name as ScenePermission,
    named[name as ScenePermission] ?? unnamed,
  ]);
}

/** Read what the scene's phone will change into `folder`, changing nothing on the phone. */
export async function saveSceneDevice(
  device: SceneDevice,
  app: SceneApp,
  phone: PhoneToSet,
  folder: string
): Promise<SavedSceneDevice> {
  const saved: SavedSceneDevice = {
    iosTcc: [],
    iosKeychain: [],
    iosLocation: false,
    androidWas: {},
  };
  if (device.platform === 'ios') {
    const simulator = deviceState().simulatorFolder(device.udid);
    // The notification grant is the clean device's own save (the BulletinBoard file).
    saved.iosTcc = copyFilesOut(
      path.join(simulator, TCC_FOLDER),
      TCC_FILES,
      path.join(folder, 'tcc')
    );
    if (phone.member) {
      const keychain = path.join(simulator, KEYCHAIN_FOLDER);
      saved.iosKeychain = copyFilesOut(keychain, KEYCHAIN_FILES, path.join(folder, 'keychain'));
    }
    saved.iosLocation = phone.location !== undefined;
    return saved;
  }
  const states = await androidPermissionStates(device.serial, app);
  for (const [name] of permissionsToSet(phone)) {
    for (const permission of PLATFORM_NAMES[name].android) {
      if (permission in states) saved.androidWas[permission] = states[permission];
    }
  }
  if (phone.location && isEmulator(device.serial)) {
    saved.androidLocation = await androidLocation(device.serial);
  }
  return saved;
}

/** Set the scene's member, permissions and location; answers what the phone could not take, with why. */
export async function applySceneDevice(
  target: { device: SceneDevice; app: SceneApp },
  phone: PhoneToSet | undefined
): Promise<PhoneNotApplied[]> {
  const notApplied: PhoneNotApplied[] = [];
  if (!phone) return [];
  const { run } = deviceState();
  const { device, app } = target;
  const attempt = async (setting: string, wanted: string, act: () => Promise<unknown>) => {
    try {
      await act();
    } catch {
      // The phone refused this one: it is listed as not applied and the capture goes on.
      notApplied.push({ setting, wanted, why: 'phone-refused' });
    }
  };
  const ios = device.platform === 'ios';
  const { member } = phone;

  if (member) await attempt('member', member, () => setMember(device, app, member));
  // Without the app's declarations nothing it declares was answered: say so, not "declares nothing".
  if (phone.declared?.unreadable) {
    notApplied.push({
      setting: 'permissions',
      wanted: 'every permission the app declares',
      why: 'phone-refused',
    });
  }

  const android =
    device.platform === 'android' ? await androidPermissionStates(device.serial, app) : {};
  const named = phone.permissions ?? {};
  let reset = false;
  for (const [name, answer] of permissionsToSet(phone)) {
    if (ios) {
      reset = reset || answer === 'reset';
      await attempt(name, answer, () =>
        name === 'notifications'
          ? setIosNotifications(
              device.udid,
              app,
              answer === 'reset' ? 'unset' : answer === 'granted'
            )
          : run('xcrun', [
              'simctl',
              'privacy',
              device.udid,
              answer === 'granted' ? 'grant' : answer === 'denied' ? 'revoke' : 'reset',
              PLATFORM_NAMES[name].ios,
              app.id,
            ])
      );
      continue;
    }
    // A permission the app's manifest does not declare cannot be granted or revoked.
    const declared = PLATFORM_NAMES[name].android.filter((permission) => permission in android);
    if (declared.length === 0 && name in named) {
      notApplied.push({ setting: name, wanted: answer, why: 'phone-refused' });
    }
    for (const permission of declared) {
      await attempt(name, answer, () =>
        run('adb', [
          '-s',
          device.serial,
          'shell',
          'pm',
          answer === 'granted' ? 'grant' : 'revoke',
          app.id,
          permission,
        ])
      );
    }
  }

  if (ios && phone.declared?.tracking && member !== 'fresh-install') {
    await attempt('tracking', 'granted', () => writeTrackingRow(device.udid, app));
  }
  if (ios && (reset || member === 'fresh-install')) {
    // SpringBoard reads the answered dialogs when it starts; launchd starts it again at once.
    await attempt('permissions', 'a fresh dialog', () =>
      run('xcrun', ['simctl', 'spawn', device.udid, 'launchctl', 'stop', 'com.apple.SpringBoard'])
    );
  }

  const { location } = phone;
  if (location) {
    const wanted = `${location.latitude},${location.longitude}`;
    if (ios) {
      await attempt('location', wanted, () =>
        run('xcrun', ['simctl', 'location', device.udid, 'set', wanted])
      );
    } else if (isEmulator(device.serial) && (await androidLocation(device.serial))) {
      await attempt('location', wanted, () => geoFix(device.serial, location));
    } else {
      // A real phone cannot be sent a location by adb, and an emulator whose earlier location
      // cannot be read could not be put back: neither is moved.
      notApplied.push({ setting: 'location', wanted, why: 'phone-refused' });
    }
  }
  return notApplied;
}

/** Wipe what the member says the app starts without: the stored logins, and on a fresh install the data. */
async function setMember(
  device: SceneDevice,
  app: SceneApp,
  member: 'signed-out' | 'fresh-install'
): Promise<void> {
  const { run, simulatorFolder } = deviceState();
  if (device.platform === 'android') {
    // Android keeps its logins in the app's own data, which the clean device has wiped; a fresh
    // install also forgets every answered permission, which `pm clear` does.
    if (member === 'fresh-install') {
      await run('adb', ['-s', device.serial, 'shell', 'pm', 'clear', app.id]);
    }
    return;
  }
  if (member === 'fresh-install') {
    await run('xcrun', ['simctl', 'privacy', device.udid, 'reset', 'all', app.id]);
  }
  // The app's items in the simulator's keychain, by the app's access group (a team prefix may lead).
  const group = `agrp = '${app.id}' OR agrp LIKE '%.${app.id}'`;
  const wipe = ['genp', 'inet', 'cert', 'keys'].map(
    (table) => `DELETE FROM ${table} WHERE ${group};`
  );
  await run('sqlite3', [
    path.join(simulatorFolder(device.udid), KEYCHAIN_FOLDER, KEYCHAIN_FILES[0]),
    wipe.join(' '),
  ]);
  await stopDaemon(device.udid, 'com.apple.securityd');
}

/** Write the app's tracking row into the simulator's privacy store: the prompt is answered "allow". */
async function writeTrackingRow(udid: string, app: SceneApp): Promise<void> {
  const row =
    'INSERT OR REPLACE INTO access (service, client, client_type, auth_value, auth_reason, ' +
    "auth_version, flags, last_modified) VALUES ('kTCCServiceUserTracking', " +
    `'${app.id}', 0, 2, 2, 1, 0, strftime('%s','now'));`;
  const store = path.join(deviceState().simulatorFolder(udid), TCC_FOLDER, TCC_FILES[0]);
  await deviceState().run('sqlite3', [store, row]);
  await stopDaemon(udid, 'com.apple.tccd');
}

/** Stop a simulator daemon that reads its file once, so it reads the changed file; launchd starts it again. */
function stopDaemon(udid: string, daemon: string): Promise<string> {
  return deviceState().run('xcrun', ['simctl', 'spawn', udid, 'launchctl', 'stop', daemon]);
}

/** Copy the files of `from` that exist into `to`; answers which. */
function copyFilesOut(from: string, files: string[], to: string): string[] {
  const found = files.filter((file) => fs.existsSync(path.join(from, file)));
  for (const file of found) {
    fs.mkdirSync(to, { recursive: true });
    fs.copyFileSync(path.join(from, file), path.join(to, file));
  }
  return found;
}

/** Put the copied `files` of `from` back into `to`, over what the scene left there. */
function copyFilesBack(from: string, files: string[], allFiles: string[], to: string): void {
  for (const file of allFiles) fs.rmSync(path.join(to, file), { force: true });
  for (const file of files) fs.copyFileSync(path.join(from, file), path.join(to, file));
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
    const simulator = deviceState().simulatorFolder(device.udid);
    if (saved.iosTcc.length > 0) {
      await step('the permissions', async () => {
        copyFilesBack(
          path.join(folder, 'tcc'),
          saved.iosTcc,
          TCC_FILES,
          path.join(simulator, TCC_FOLDER)
        );
        // The permissions daemon reads the file when it starts; launchd starts it again at once.
        await stopDaemon(device.udid, 'com.apple.tccd');
      });
    }
    if (saved.iosKeychain.length > 0) {
      await step('the keychain', async () => {
        const keychain = path.join(simulator, KEYCHAIN_FOLDER);
        copyFilesBack(path.join(folder, 'keychain'), saved.iosKeychain, KEYCHAIN_FILES, keychain);
        await stopDaemon(device.udid, 'com.apple.securityd');
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

export function isEmulator(serial: string): boolean {
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
