/** THE LOCAL DEVICE - the simulator or emulator a capture ran on, named the way Sherlo names it. */
import fs from 'fs';
import os from 'os';
import path from 'path';
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

describe('the local device', () => {
  let undo: (() => void) | undefined;
  afterEach(() => {
    undo?.();
    delete process.env.ANDROID_AVD_HOME;
  });

  it('a simulator whose model and system Sherlo has is named by its Sherlo device', async () => {
    undo = simulatorOf('iPad Air 11-inch (M2)', 'iOS-17-5');

    const device = await readLocalDevice({ platform: 'ios', udid: 'SIM-1' });

    expect(device).toEqual({ deviceId: expect.stringContaining('ipad'), os: 'iOS 17.5' });
  });

  it('a simulator Sherlo does not have is named by its model and system as a local simulator', async () => {
    undo = simulatorOf('iPad Air 11-inch (M2)', 'iOS-18-2');

    const device = await readLocalDevice({ platform: 'ios', udid: 'SIM-1' });

    expect(device).toEqual({ local: true, model: 'iPad Air 11-inch (M2)', os: 'iOS 18.2' });
  });

  it('an emulator is matched by its device name and API level', async () => {
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
      writeConfig('pixel_7', 33);
      expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5554' })).toEqual({
        deviceId: expect.stringContaining('pixel'),
        os: 'Android 13',
      });

      writeConfig('pixel_7', 34);
      expect(await readLocalDevice({ platform: 'android', serial: 'emulator-5554' })).toEqual({
        local: true,
        model: 'pixel_7',
        os: 'Android 14',
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
});
