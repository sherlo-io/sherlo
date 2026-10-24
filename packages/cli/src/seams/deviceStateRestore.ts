/**
 * THE RESTORE - the second half of ./deviceState: put back what ./deviceStateSave saved.
 *
 * EVERY STEP IS TRIED. A restore that stopped at its first failure would leave the rest of the
 * device as the scene left it, so each step runs on its own and a failure is only noted; the
 * caller keeps the save folder and names it when any step failed. The app is closed first, so it
 * does not write over its data as the data comes back.
 */
import fs from 'fs';
import path from 'path';
import { deviceState } from './deviceState';
import type { SceneApp, SceneDevice } from './deviceState';
import {
  ANIMATION_SCALES,
  BULLETIN_BOARD,
  POST_NOTIFICATIONS,
  emptyTheAndroidData,
  emptyTheContainer,
  stopTheApp,
} from './deviceStateSave';
import type { SavedDevice } from './deviceStateSave';

/** Put the device back as `saved` found it; answers what could not be put back, empty when all was. */
export async function restoreDeviceState(
  device: SceneDevice,
  app: SceneApp,
  saved: SavedDevice
): Promise<string[]> {
  const failures: string[] = [];
  const step = async (what: string, act: () => Promise<void> | void) => {
    try {
      await act();
    } catch (error) {
      failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  await step('closing the app', () => stopTheApp(device, app));

  if (device.platform === 'ios' && saved.platform === 'ios') {
    await restoreIos(device.udid, saved, step);
  }
  if (device.platform === 'android' && saved.platform === 'android') {
    await restoreAndroid(device.serial, app, saved, step);
  }

  return failures;
}

type Step = (what: string, act: () => Promise<void> | void) => Promise<void>;

async function restoreIos(
  udid: string,
  saved: Extract<SavedDevice, { platform: 'ios' }>,
  step: Step
): Promise<void> {
  const { run, simulatorFolder } = deviceState();

  await step("the app's data", () => {
    emptyTheContainer(saved.container, saved.parts);
    for (const part of saved.parts) {
      fs.cpSync(path.join(saved.folder, 'data', part), path.join(saved.container, part), {
        recursive: true,
      });
    }
  });

  await step('Reduce Motion', async () => {
    const defaults = ['simctl', 'spawn', udid, 'defaults'];
    const key = ['com.apple.Accessibility', 'ReduceMotionEnabled'];
    await run(
      'xcrun',
      saved.reduceMotion === null
        ? [...defaults, 'delete', ...key]
        : [...defaults, 'write', ...key, '-bool', saved.reduceMotion === '1' ? 'true' : 'false']
    );
  });

  await step('the notification settings', async () => {
    const bulletins = path.join(simulatorFolder(udid), BULLETIN_BOARD);
    if (saved.hadBulletins) fs.copyFileSync(path.join(saved.folder, 'bulletins.plist'), bulletins);
    else fs.rmSync(bulletins, { force: true });
    // SpringBoard reads the file when it starts; launchd starts it again at once.
    await run('xcrun', ['simctl', 'spawn', udid, 'launchctl', 'stop', 'com.apple.SpringBoard']);
  });
}

async function restoreAndroid(
  serial: string,
  app: SceneApp,
  saved: Extract<SavedDevice, { platform: 'android' }>,
  step: Step
): Promise<void> {
  const { run } = deviceState();
  const adb = (...args: string[]) => run('adb', ['-s', serial, ...args]);

  await step("the app's data", async () => {
    await emptyTheAndroidData(serial, app);
    await run('adb', ['-s', serial, 'shell', `run-as ${app.id} tar -xf -`], {
      stdinFrom: saved.dataTar,
    });
  });

  for (const scale of ANIMATION_SCALES) {
    const was = saved.scales[scale];
    await step(scale, async () => {
      await (was === null
        ? adb('shell', 'settings', 'delete', 'global', scale)
        : adb('shell', 'settings', 'put', 'global', scale, was));
    });
  }

  if (saved.notifications === 'not-granted') {
    await step('the notifications permission', async () => {
      await adb('shell', 'pm', 'revoke', app.id, POST_NOTIFICATIONS);
    });
  }
}
