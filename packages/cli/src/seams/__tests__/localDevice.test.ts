/** THE LOCAL DEVICE - the simulator or emulator a capture ran on, named the way Sherlo names it. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiLevelOf, catalogDevice } from './catalogDevice';
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

const pixel7 = catalogDevice('pixel.7');
const ipadAir = catalogDevice('ipad.air.11.m2');

describe('the local device', () => {
  let undo: (() => void) | undefined;
  afterEach(() => {
    undo?.();
    delete process.env.ANDROID_AVD_HOME;
  });

  it('a simulator whose model and system Sherlo has is named by its Sherlo device', async () => {
    undo = simulatorOf(ipadAir.emuName, `iOS-${ipadAir.held}-5`);

    const device = await readLocalDevice({ platform: 'ios', udid: 'SIM-1' });

    expect(device).toEqual({ deviceId: 'ipad.air.11.m2', os: `iOS ${ipadAir.held}.5` });
  });

  it('a simulator Sherlo does not have is named by its model and system as a local simulator', async () => {
    undo = simulatorOf(ipadAir.emuName, `iOS-${ipadAir.lacking}-2`);

    const device = await readLocalDevice({ platform: 'ios', udid: 'SIM-1' });

    expect(device).toEqual({ local: true, model: ipadAir.emuName, os: `iOS ${ipadAir.lacking}.2` });
  });

  it('an emulator is matched by its device name and API level, and one at an API level the catalog lacks for that device stays local', async () => {
    const avdHome = fs.mkdtempSync(path.join(os.tmpdir(), 'avd-home-'));
    process.env.ANDROID_AVD_HOME = avdHome;
    fs.mkdirSync(path.join(avdHome, 'Pixel_7_API_33.avd'));
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
      writeConfig(pixel7.emuName, apiLevelOf(pixel7.held));
      expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5554' })).toEqual({
        deviceId: 'pixel.7',
        os: `Android ${pixel7.held}`,
      });

      writeConfig(pixel7.emuName, apiLevelOf(pixel7.lacking));
      expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5554' })).toEqual({
        local: true,
        model: pixel7.emuName,
        os: `Android ${pixel7.lacking}`,
      });
    } finally {
      fs.rmSync(avdHome, { recursive: true, force: true });
    }
  });

  it('an emulator is read from the folder it names, and one with no config.ini stays unread', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'avd-own-'));
    fs.writeFileSync(
      path.join(folder, 'config.ini'),
      `hw.device.name=${pixel7.emuName}\nimage.sysdir.1=system-images/android-${apiLevelOf(pixel7.lacking)}/default/arm64-v8a/\n`
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
        model: pixel7.emuName,
        os: `Android ${pixel7.lacking}`,
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
      `hw.device.name=${pixel7.emuName}\nimage.sysdir.1=system-images/android-${apiLevelOf(pixel7.held)}/google_apis/arm64-v8a/\n`
    );
    undo = installDeviceState({
      ...posedDeviceState(),
      run: async (_tool, args) =>
        args.includes('ro.kernel.qemu.avd_name') ? 'Pixel_7_API_33\n' : '',
    });
    try {
      expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5584' })).toEqual({
        deviceId: 'pixel.7',
        os: `Android ${pixel7.held}`,
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
      `hw.device.name=${pixel7.emuName}\nimage.sysdir.1=system-images/android-${apiLevelOf(pixel7.lacking)}/default/arm64-v8a/\n`
    );
    undo = installDeviceState({
      ...posedDeviceState(),
      run: async (_tool, args) => (args.includes('path') ? `${folder}\nOK\n` : ''),
    });
    try {
      expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5584' })).toEqual({
        local: true,
        model: pixel7.emuName,
        os: `Android ${pixel7.lacking}`,
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
