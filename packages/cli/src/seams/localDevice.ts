/**
 * THE LOCAL DEVICE - the simulator or emulator a capture ran on, named the way Sherlo names it.
 *
 * A device Sherlo has (same model name, same major system version as an entry of `DEVICES`) is
 * named by its Sherlo device id. Any other is `{ local: true, model, os }`, so a kept capture never
 * claims a device it was not taken on.
 *
 *     iOS      `simctl list devices` gives the booted device's type and runtime, `simctl list
 *              devicetypes` gives the type's name.
 *     Android  the AVD's `config.ini` gives `hw.device.name` and, in `image.sysdir.1`, the API level;
 *              the folder is the one `adb emu avd path` names, else the SDK's usual AVD homes. The
 *              name is what `adb emu avd name` prints; when the console answers nothing (empty, exit
 *              0), the phone's own `ro.boot.qemu.avd_name`, then `ro.kernel.qemu.avd_name`, gives it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEVICES } from '@sherlo/shared';
import { deviceState } from './deviceState';
import type { SceneDevice } from './deviceState';

/** A device Sherlo has, or the model and system of one it does not. `os` reads `iOS 17.5` or `Android 14`. */
export type LocalDevice =
  | { deviceId: string; os: string }
  | { local: true; model: string; os: string };

type ModelAndVersion = { model: string; version: string };

/** The Android version each API level ships as; a level not listed is read as unknown. */
const ANDROID_VERSION_OF_API: Record<number, string> = {
  24: '7',
  25: '7',
  26: '8',
  27: '8',
  28: '9',
  29: '10',
  30: '11',
  31: '12',
  32: '12',
  33: '13',
  34: '14',
  35: '15',
  36: '16',
};

/** The device the capture ran on, or undefined when the machine cannot say (a real phone, no Xcode, no AVD folder). */
export async function readLocalDevice(device: SceneDevice): Promise<LocalDevice | undefined> {
  try {
    const found =
      device.platform === 'ios'
        ? await simulatorModel(device.udid)
        : await emulatorModel(device.serial);
    return found && named(device.platform, found);
  } catch {
    return undefined;
  }
}

/** Name a model and system by the Sherlo device that has both, else as a local device. */
function named(
  platform: SceneDevice['platform'],
  { model, version }: ModelAndVersion
): LocalDevice {
  const system = `${platform === 'ios' ? 'iOS' : 'Android'} ${version}`;
  const major = version.split('.')[0];
  const sherloDevice = Object.entries(DEVICES).find(
    ([, candidate]) =>
      candidate.os === platform &&
      candidate.emuName === model &&
      candidate.osVersions.some((supported) => supported.version === major)
  );
  return sherloDevice
    ? { deviceId: sherloDevice[0], os: system }
    : { local: true, model, os: system };
}

/** What `xcrun simctl list <what> -j` prints, read as the shape the caller expects. */
async function simctlList<Shape>(what: 'devices' | 'devicetypes'): Promise<Shape> {
  const printed = await deviceState().run('xcrun', ['simctl', 'list', what, '-j']);
  return JSON.parse(printed) as Shape;
}

async function simulatorModel(udid: string): Promise<ModelAndVersion | undefined> {
  const listed = await simctlList<{
    devices: Record<string, Array<{ udid: string; deviceTypeIdentifier?: string }>>;
  }>('devices');
  for (const [runtime, simulators] of Object.entries(listed.devices)) {
    const simulator = simulators.find((candidate) => candidate.udid === udid);
    if (!simulator) continue;
    const types = await simctlList<{ devicetypes: Array<{ identifier: string; name: string }> }>(
      'devicetypes'
    );
    const type = types.devicetypes.find(
      (candidate) => candidate.identifier === simulator.deviceTypeIdentifier
    );
    // The runtime `com.apple.CoreSimulator.SimRuntime.iOS-17-5` is system 17.5.
    const version = runtime
      .split('.')
      .pop()
      ?.replace(/^[A-Za-z]+-/, '')
      .replace(/-/g, '.');
    return type && version ? { model: type.name, version } : undefined;
  }
  return undefined;
}

/** The first line the emulator console prints; the second is `OK`. */
function firstLine(said: string): string {
  return /^[^\r\n]+/.exec(said)?.[0].trim() ?? '';
}

/** What `adb -s <serial> <args>` prints on its first line; empty when adb fails or says nothing. */
function adbSays(serial: string, args: string[]): Promise<string> {
  return deviceState()
    .run('adb', ['-s', serial, ...args])
    .then(firstLine)
    .catch(() => '');
}

/** The folders an AVD may live in: where the emulator says, else (when its name is known) the places the SDK keeps AVDs. */
async function avdFolders(serial: string, avdName: string): Promise<string[]> {
  const homes = [
    process.env.ANDROID_AVD_HOME,
    process.env.ANDROID_USER_HOME && path.join(process.env.ANDROID_USER_HOME, 'avd'),
    process.env.ANDROID_SDK_HOME && path.join(process.env.ANDROID_SDK_HOME, '.android', 'avd'),
    path.join(os.homedir(), '.android', 'avd'),
  ];
  const own = await adbSays(serial, ['emu', 'avd', 'path']);
  const named = avdName ? homes.map((home) => home && path.join(home, `${avdName}.avd`)) : [];
  return [own, ...named].filter(Boolean) as string[];
}

/** The AVD's name: the console's answer, else the first of the phone's own properties that is not empty. */
async function avdNameOf(serial: string): Promise<string> {
  const fromConsole = await adbSays(serial, ['emu', 'avd', 'name']);
  if (fromConsole) return fromConsole;
  for (const property of ['ro.boot.qemu.avd_name', 'ro.kernel.qemu.avd_name']) {
    const fromPhone = await adbSays(serial, ['shell', 'getprop', property]);
    if (fromPhone) return fromPhone;
  }
  return '';
}

/** The emulator's model and system, read from its AVD's config.ini; undefined when that file cannot be found. */
async function emulatorModel(serial: string): Promise<ModelAndVersion | undefined> {
  const avdName = await avdNameOf(serial);
  const folder = (await avdFolders(serial, avdName)).find((candidate) =>
    fs.existsSync(path.join(candidate, 'config.ini'))
  );
  if (!folder) return undefined;
  const config = fs.readFileSync(path.join(folder, 'config.ini'), 'utf8');
  const model = /^hw\.device\.name\s*=\s*(.+)$/m.exec(config)?.[1].trim();
  const api = Number(/^image\.sysdir\.1\s*=.*android-(\d+)/m.exec(config)?.[1]);
  const version = ANDROID_VERSION_OF_API[api];
  return model && version ? { model, version } : undefined;
}
