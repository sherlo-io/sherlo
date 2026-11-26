/** THE LOCAL DEVICE - the simulator or emulator a capture ran on, named the way Sherlo names it. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEVICES } from '@sherlo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDeviceState, posedDeviceState } from '../deviceState';
import { readLocalDevice } from '../localDevice';

/** A machine whose one booted simulator is `model` on the runtime `iOS-<version>`. */
function simulatorOf(model: string, runtime: string) {
  return installDeviceState({
    ...posedDeviceState(),
    run: async (_tool, args) =>
      args.includes('devicetypes')
        ? JSON.stringify({ devicetypes: [{ identifier: 'type-1', name: model }] })
        : JSON.stringify({
            devices: {
              [`com.apple.CoreSimulator.SimRuntime.${runtime}`]: [
                { udid: 'SIM-1', deviceTypeIdentifier: 'type-1' },
              ],
            },
          }),
  });
}

/** The API levels from Android 13 on, where the Android version is the API level minus 20. */
const API_LEVELS = [33, 34, 35, 36];

/** An API level the catalog holds for the Pixel 7 (`held`) and one it lacks (`lacking`). */
function pixel7ApiLevels() {
  const versions = DEVICES['pixel.7'].osVersions.map((supported) => supported.version);
  const held = API_LEVELS.filter((api) => versions.includes(String(api - 20)));
  const lacking = API_LEVELS.filter((api) => !held.includes(api));
  return { held: held[0], lacking: lacking[0] };
}

/** An iOS major the catalog holds for the iPad Air 11-inch (M2) (`held`) and one above them all (`lacking`). */
function ipadAirMajors() {
  const majors = DEVICES['ipad.air.11.m2'].osVersions.map((supported) => Number(supported.version));
  return { held: majors[0], lacking: Math.max(...majors) + 1 };
}

describe('the local device', () => {
  let undo: (() => void) | undefined;
  afterEach(() => {
    undo?.();
    delete process.env.ANDROID_AVD_HOME;
  });

  it('a simulator whose model and system Sherlo has is named by its Sherlo device', async () => {
    undo = simulatorOf('iPad Air 11-inch (M2)', `iOS-${ipadAirMajors().held}-5`);

    const device = await readLocalDevice({ platform: 'ios', udid: 'SIM-1' });

    expect(device).toEqual({ deviceId: 'ipad.air.11.m2', os: `iOS ${ipadAirMajors().held}.5` });
  });

  it('a simulator Sherlo does not have is named by its model and system as a local simulator', async () => {
    undo = simulatorOf('iPad Air 11-inch (M2)', `iOS-${ipadAirMajors().lacking}-2`);

    const device = await readLocalDevice({ platform: 'ios', udid: 'SIM-1' });

    expect(device).toEqual({
      local: true,
      model: 'iPad Air 11-inch (M2)',
      os: `iOS ${ipadAirMajors().lacking}.2`,
    });
  });

  it('an emulator is matched by its device name and API level, and one at an API level the catalog lacks for that device stays local', async () => {
    const avdHome = fs.mkdtempSync(path.join(os.tmpdir(), 'avd-home-'));
    process.env.ANDROID_AVD_HOME = avdHome;
    fs.mkdirSync(path.join(avdHome, 'Pixel_7_API_33.avd'));
    const { held, lacking } = pixel7ApiLevels();
    const writeConfig = (name: string, api: number) =>
      fs.writeFileSync(
        path.join(avdHome, 'Pixel_7_API_33.avd', 'config.ini'),
        `hw.device.name=${name}\nimage.sysdir.1=system-images/android-${api}/google_apis/arm64-v8a/\n`
      );
    undo = installDeviceState({
      ...posedDeviceState(),
      run: async () => 'Pixel_7_API_33\nOK\n',
    });
    try {
      writeConfig('pixel_7', held);
      expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5554' })).toEqual({
        deviceId: 'pixel.7',
        os: `Android ${held - 20}`,
      });

      writeConfig('pixel_7', lacking);
      expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5554' })).toEqual({
        local: true,
        model: 'pixel_7',
        os: `Android ${lacking - 20}`,
      });
    } finally {
      fs.rmSync(avdHome, { recursive: true, force: true });
    }
  });

  it('an emulator is read from the folder it names, and one with no config.ini stays unread', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'avd-own-'));
    fs.writeFileSync(
      path.join(folder, 'config.ini'),
      'hw.device.name=pixel_xl\nimage.sysdir.1=system-images/android-31/default/arm64-v8a/\n'
    );
    vi.stubEnv('ANDROID_AVD_HOME', path.join(folder, 'nowhere'));
    try {
      undo = installDeviceState({
        ...posedDeviceState(),
        run: async (_tool, args) =>
          args.includes('path') ? `${folder}\nOK\n` : 'Pixel_XL_API_31\nOK\n',
      });
      expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5554' })).toEqual({
        local: true,
        model: 'pixel_xl',
        os: 'Android 12',
      });

      fs.rmSync(path.join(folder, 'config.ini'));
      expect(
        await readLocalDevice({ platform: 'android', serial: 'emulator-5554' })
      ).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it("an emulator whose console answers nothing is named by the phone's own property", async () => {
    const avdHome = fs.mkdtempSync(path.join(os.tmpdir(), 'avd-home-'));
    vi.stubEnv('ANDROID_AVD_HOME', avdHome);
    fs.mkdirSync(path.join(avdHome, 'Pixel_7_API_33.avd'));
    fs.writeFileSync(
      path.join(avdHome, 'Pixel_7_API_33.avd', 'config.ini'),
      'hw.device.name=pixel_7\nimage.sysdir.1=system-images/android-33/google_apis/arm64-v8a/\n'
    );
    undo = installDeviceState({
      ...posedDeviceState(),
      run: async (_tool, args) =>
        args.includes('ro.kernel.qemu.avd_name') ? 'Pixel_7_API_33\n' : '',
    });
    try {
      expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5584' })).toEqual({
        deviceId: expect.stringContaining('pixel'),
        os: 'Android 13',
      });
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(avdHome, { recursive: true, force: true });
    }
  });

  it('an emulator with no name is still read from the folder its console path names', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'avd-own-'));
    fs.writeFileSync(
      path.join(folder, 'config.ini'),
      'hw.device.name=pixel_xl\nimage.sysdir.1=system-images/android-31/default/arm64-v8a/\n'
    );
    undo = installDeviceState({
      ...posedDeviceState(),
      run: async (_tool, args) => (args.includes('path') ? `${folder}\nOK\n` : ''),
    });
    try {
      expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5584' })).toEqual({
        local: true,
        model: 'pixel_xl',
        os: 'Android 12',
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('the boot property is asked before the kernel property', async () => {
    const asked: string[] = [];
    undo = installDeviceState({
      ...posedDeviceState(),
      run: async (_tool, args) => {
        asked.push(args.slice(2).join(' '));
        return args.includes('ro.boot.qemu.avd_name') ? 'Some_AVD\n' : '';
      },
    });

    await readLocalDevice({ platform: 'android', serial: 'emulator-5584' });

    expect(asked).toContain('shell getprop ro.boot.qemu.avd_name');
    expect(asked).not.toContain('shell getprop ro.kernel.qemu.avd_name');
  });

  it('an emulator that gives no name by either road stays unnamed', async () => {
    undo = installDeviceState({ ...posedDeviceState(), run: async () => '' });

    expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5584' })).toBeUndefined();
  });
});
