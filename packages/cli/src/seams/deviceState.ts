/**
 * THE CLEAN DEVICE SEAM - a local scene starts from nothing, and the developer's own device comes
 * back when the command ends.
 *
 *     live   - the developer's one booted simulator or connected emulator, driven with `xcrun`,
 *              `adb` and `applesimutils`, and the app named by the project's own files.
 *     posed  - no device at all: a pose never reaches a machine, so no scene in a pose is given a
 *              clean device and no screen changes because of one.
 *
 * WHAT A CLEAN DEVICE IS (sherlo scenes/stability.md, "What does the clean device do?"): the app's
 * data is wiped, notifications are granted, and Reduce Motion is on (on Android, the three
 * animation scales are 0). Each of those is SAVED FIRST, into a folder of its own in the system's
 * temp folder, and nothing on the device changes until the whole save is in. ./deviceStateSave
 * reads and changes; ./deviceStateRestore puts back.
 *
 * EVERY ENDING PUTS IT BACK. The command calls the restore this module hands out on its normal
 * end and on a throw; an interrupt (SIGINT, SIGTERM) is caught here, restores, and only then ends
 * the process. A restore that fails leaves the save folder where it is and names it, so the
 * developer can put the rest back by hand.
 *
 * THE KEYCHAIN IS NEVER TOUCHED. It is the developer's own logins, it lives outside the app's
 * container, and no tool here is asked to reset it. Cloud devices reset it; this machine is not one.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import getCwd from '../helpers/getCwd';
import { readProjectJson } from '../helpers/projectJson';
import { cleanTheDevice, saveDeviceState } from './deviceStateSave';
import { restoreDeviceState } from './deviceStateRestore';
import { readIfThere } from './iosConfiguration';

/** The device a scene runs on: a simulator by its UDID, or an emulator or phone by its adb serial. */
export type SceneDevice =
  | { platform: 'ios'; udid: string }
  | { platform: 'android'; serial: string };

/** The app under test: its iOS bundle identifier or its Android package name. */
export type SceneApp = { id: string };

export type SceneTarget = { device: SceneDevice; app: SceneApp };

/** The only programs this seam runs. */
export type DeviceTool = 'xcrun' | 'adb' | 'applesimutils';

export type DeviceState = {
  /** The one device and app a local scene runs on, or nothing when there is not exactly one. */
  sceneTarget(): Promise<SceneTarget | undefined>;
  /** Run one device tool and answer what it printed; a tool that fails throws. */
  run(
    tool: DeviceTool,
    args: string[],
    options?: { stdoutTo?: string; stdinFrom?: string }
  ): Promise<string>;
  /** The simulator's own data folder, where it keeps the notification settings of every app. */
  simulatorFolder(udid: string): string;
  /** A new, empty folder for one run's save, in the system's temp folder and named for the app. */
  makeSaveFolder(app: SceneApp): string;
};

/* ========================================================================== */

/**
 * Save the device, then clean it for one scene, and hand back the restore that puts it back.
 *
 * Call the restore on every ending; calling it twice restores once. Until it runs, an interrupt
 * restores and ends the process with the signal's own exit code.
 */
export async function prepareCleanDevice(
  device: SceneDevice,
  app: SceneApp
): Promise<() => Promise<void>> {
  const folder = deviceState().makeSaveFolder(app);

  let saved: Awaited<ReturnType<typeof saveDeviceState>>;
  try {
    saved = await saveDeviceState(device, app, folder);
  } catch (error) {
    // Nothing on the device has changed yet, so the half-made save is worth nothing.
    fs.rmSync(folder, { recursive: true, force: true });
    throw error;
  }

  let restoring: Promise<void> | undefined;
  const restore = (): Promise<void> => {
    restoring ??= putBack();
    return restoring;
  };
  const putBack = async (): Promise<void> => {
    releaseTheHold();
    const failures = await restoreDeviceState(device, app, saved);
    // Only now: a second Ctrl-C while the device is being put back must not cut the restore short.
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
    if (failures.length === 0) {
      fs.rmSync(folder, { recursive: true, force: true });
      return;
    }
    process.stderr.write(
      `Sherlo could not put the device back as it was (${failures.join('; ')}). ` +
        `What it saved is in ${folder}\n`
    );
  };
  // The signal's own exit codes, once the device is back: 128 + 2 for SIGINT, 128 + 15 for SIGTERM.
  const onInterrupt = () => {
    restore().then(
      () => process.exit(130),
      () => process.exit(130)
    );
  };
  const onTerminate = () => {
    restore().then(
      () => process.exit(143),
      () => process.exit(143)
    );
  };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);

  try {
    await cleanTheDevice(device, app, saved);
  } catch (error) {
    await restore();
    throw error;
  }

  return restore;
}

/* ========================================================================== */

let hold: { timer: NodeJS.Timeout; release: () => void } | undefined;

/**
 * Keep the process, and so the clean device, alive until the developer stops the command: `open`
 * leaves its scene on screen, and putting the device back would close the app under them. The
 * restore of {@link prepareCleanDevice} releases it.
 */
export function holdTheCleanDevice(): Promise<void> {
  return new Promise((resolve) => {
    hold = { timer: setInterval(() => undefined, 60_000), release: resolve };
  });
}

function releaseTheHold(): void {
  if (!hold) return;
  clearInterval(hold.timer);
  hold.release();
  hold = undefined;
}

/* ========================================================================== */
/* The live device                                                            */
/* ========================================================================== */

/** The shipped answers: the developer's own simulator or emulator. */
export const liveDeviceState: DeviceState = {
  sceneTarget: async () => {
    const devices = [...(await bootedSimulators()), ...(await connectedAndroids())];
    if (devices.length !== 1) return undefined;

    const id = appIdOf(devices[0].platform, getCwd());
    return id ? { device: devices[0], app: { id } } : undefined;
  },

  run: (tool, args, { stdoutTo, stdinFrom } = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn(tool, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      const file = stdoutTo ? fs.createWriteStream(stdoutTo) : undefined;
      if (file) child.stdout.pipe(file);
      else child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
      if (stdinFrom) fs.createReadStream(stdinFrom).pipe(child.stdin);
      else child.stdin.end();
      child.on('error', reject);
      child.on('close', (code) => {
        const said = Buffer.concat(err).toString('utf8').trim();
        const finish = () =>
          code === 0
            ? resolve(Buffer.concat(out).toString('utf8'))
            : reject(new Error(`${tool} ${args.join(' ')} failed: ${said || `exit ${code}`}`));
        if (file) file.end(finish);
        else finish();
      });
    }),

  simulatorFolder: (udid) =>
    path.join(os.homedir(), 'Library/Developer/CoreSimulator/Devices', udid, 'data'),

  makeSaveFolder: (app) => fs.mkdtempSync(path.join(os.tmpdir(), `sherlo-clean-device-${app.id}-`)),
};

async function bootedSimulators(): Promise<SceneDevice[]> {
  if (process.platform !== 'darwin') return [];
  try {
    const listed = JSON.parse(
      await liveDeviceState.run('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'])
    ) as { devices: Record<string, Array<{ udid: string; state: string }>> };
    return Object.values(listed.devices)
      .flat()
      .filter((simulator) => simulator.state === 'Booted')
      .map((simulator) => ({ platform: 'ios', udid: simulator.udid }));
  } catch {
    // No Xcode on this machine: it has no simulator to clean.
    return [];
  }
}

async function connectedAndroids(): Promise<SceneDevice[]> {
  try {
    const listed = await liveDeviceState.run('adb', ['devices']);
    return listed
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter(([serial, state]) => serial && state === 'device')
      .map(([serial]) => ({ platform: 'android', serial }));
  } catch {
    // No Android tools on this machine: it has no emulator to clean.
    return [];
  }
}

/** The app's id as the project names it: Expo's app.json first, then the native project. */
function appIdOf(platform: SceneDevice['platform'], root: string): string | undefined {
  const expo = readProjectJson(root, 'app.json')?.expo as
    | { ios?: { bundleIdentifier?: string }; android?: { package?: string } }
    | undefined;
  const fromExpo = platform === 'ios' ? expo?.ios?.bundleIdentifier : expo?.android?.package;
  if (fromExpo) return safeId(fromExpo);

  if (platform === 'ios') {
    const iosFolder = path.join(root, 'ios');
    const projects = fs.existsSync(iosFolder)
      ? fs.readdirSync(iosFolder).filter((name) => name.endsWith('.xcodeproj'))
      : [];
    for (const project of projects) {
      const pbxproj = readIfThere(path.join(iosFolder, project, 'project.pbxproj')) ?? '';
      const ids = [...pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/g)]
        .map((match) => match[1])
        .filter((id) => !id.includes('$') && !/tests$/i.test(id));
      if (ids[0]) return safeId(ids[0]);
    }
    return undefined;
  }

  for (const file of ['build.gradle', 'build.gradle.kts']) {
    const gradle = readIfThere(path.join(root, 'android/app', file)) ?? '';
    const id = /applicationId\s*=?\s*["']([^"']+)["']/.exec(gradle)?.[1];
    if (id) return safeId(id);
  }
  return undefined;
}

/** An id goes into a device shell line, so only an id's own characters are taken. */
function safeId(id: string): string | undefined {
  return /^[A-Za-z0-9._-]+$/.test(id) ? id : undefined;
}

/* ========================================================================== */

let installed: DeviceState = liveDeviceState;

/** The device in force. */
export function deviceState(): DeviceState {
  return installed;
}

/** Install a device for the duration of one posed run or one test; the returned function undoes it. */
export function installDeviceState(next: DeviceState): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/** The device a pose has: none, so no posed scene is given a clean device. */
export function posedDeviceState(): DeviceState {
  const noDevice = (): never => {
    throw new Error('A pose has no device: a posed scene is never given a clean device.');
  };
  return {
    sceneTarget: async () => undefined,
    run: noDevice,
    simulatorFolder: noDevice,
    makeSaveFolder: noDevice,
  };
}
