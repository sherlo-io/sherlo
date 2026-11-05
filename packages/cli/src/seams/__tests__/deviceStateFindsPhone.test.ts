/**
 * A CAPTURE FINDS THE PHONE THAT HAS THE APP - which of the running simulators and emulators a
 * scene runs on. The phones are scripted; the project's files are a scratch folder.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installProjectFiles } from '../projectFiles';
import { installDeviceState, liveDeviceState, posedDeviceState } from '../deviceState';
import { SERIAL_LOOKUP_LIMIT_MS } from '../deviceStateAndroids';

let scratch: string;

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'device-state-find-test-'));
});

afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('a capture finds the phone that has the app', () => {
  const SIMULATORS = JSON.stringify({ devices: { ios: [{ udid: 'SIM-1', state: 'Booted' }] } });
  const ADB_DEVICES = 'List of devices attached\nemulator-5554\tdevice\n';
  const restores: Array<() => void> = [];

  /** A Mac with a booted simulator and a connected emulator; the app is on the phones named. */
  function twoPhones(appIsOn: Array<'ios' | 'android'>, project: Record<string, unknown>): void {
    fs.writeFileSync(path.join(scratch, 'app.json'), JSON.stringify(project));
    restores.push(installProjectFiles({ root: () => scratch }));
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    restores.push(() => Object.defineProperty(process, 'platform', platform!));
    const lists = vi.spyOn(liveDeviceState, 'run').mockImplementation(async (tool) => {
      return tool === 'xcrun' ? SIMULATORS : ADB_DEVICES;
    });
    restores.push(() => lists.mockRestore());
    restores.push(
      installDeviceState({
        ...posedDeviceState(),
        run: async (tool) => {
          if (tool === 'xcrun' && !appIsOn.includes('ios')) throw new Error('not installed');
          return tool === 'adb' && appIsOn.includes('android') ? 'package:/data/app/base.apk' : '';
        },
      })
    );
  }

  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  const BOTH_IDS = {
    expo: { ios: { bundleIdentifier: 'com.a.ios' }, android: { package: 'com.a.and' } },
  };

  it('with a simulator and an emulator running, the capture picks the phone that has the app', async () => {
    twoPhones(['android'], BOTH_IDS);
    expect(await liveDeviceState.sceneTarget()).toEqual({
      device: { platform: 'android', serial: 'emulator-5554' },
      app: { id: 'com.a.and' },
    });

    restores
      .splice(0)
      .reverse()
      .forEach((restore) => restore());
    twoPhones(['ios'], BOTH_IDS);
    expect(await liveDeviceState.sceneTarget()).toEqual({
      device: { platform: 'ios', udid: 'SIM-1' },
      app: { id: 'com.a.ios' },
    });
  });

  it('several phones with the app, or none, name every phone found', async () => {
    twoPhones(['ios', 'android'], BOTH_IDS);
    const found = [
      { platform: 'ios', udid: 'SIM-1', appId: 'com.a.ios', hasApp: true },
      { platform: 'android', serial: 'emulator-5554', appId: 'com.a.and', hasApp: true },
    ];
    expect(await liveDeviceState.sceneTarget()).toEqual({ cause: 'several-phones', found });

    restores
      .splice(0)
      .reverse()
      .forEach((restore) => restore());
    twoPhones([], BOTH_IDS);
    expect(await liveDeviceState.sceneTarget()).toEqual({
      cause: 'several-phones',
      found: found.map((phone) => ({ ...phone, hasApp: false })),
    });
  });

  /** An Android-only machine whose adb lists the given entries; each answers getprop as scripted. */
  function androidsListed(entries: Record<string, string | null>): void {
    fs.writeFileSync(
      path.join(scratch, 'app.json'),
      JSON.stringify({ expo: { android: { package: 'com.a.and' } } })
    );
    restores.push(installProjectFiles({ root: () => scratch }));
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux' });
    restores.push(() => Object.defineProperty(process, 'platform', platform!));
    const lists = vi.spyOn(liveDeviceState, 'run').mockImplementation(async (_tool, args) => {
      if (args[0] === 'devices') {
        const rows = Object.keys(entries).map((entry) => `${entry}\tdevice\n`);
        return 'List of devices attached\n' + rows.join('');
      }
      const own = entries[args[1]];
      if (own === null) throw new Error('no answer');
      if (own === 'HANG') return new Promise<string>(() => undefined);
      return own + '\n';
    });
    restores.push(() => lists.mockRestore());
    restores.push(installDeviceState({ ...posedDeviceState(), run: async () => 'package:/x' }));
  }

  const MDNS = 'adb-EMU123._adb-tls-connect._tcp';

  it('one Android phone that adb lists twice counts as one phone', async () => {
    androidsListed({ 'emulator-5554': 'EMU123', [MDNS]: 'EMU123' });
    expect(await liveDeviceState.sceneTarget()).toEqual({
      device: { platform: 'android', serial: 'emulator-5554' },
      app: { id: 'com.a.and' },
    });
  });

  it('two emulators that answer alike stay two phones, and one that does not answer is kept', async () => {
    androidsListed({ 'emulator-5554': 'EMU', 'emulator-5556': 'EMU', R5CT: null });
    expect(await liveDeviceState.sceneTarget()).toMatchObject({
      cause: 'several-phones',
      found: [{ serial: 'emulator-5554' }, { serial: 'emulator-5556' }, { serial: 'R5CT' }],
    });
  });

  it('a phone that never answers its serial lookup is kept, and the capture still finds it', async () => {
    vi.useFakeTimers();
    restores.push(() => vi.useRealTimers());
    androidsListed({ 'emulator-5554': 'HANG' });
    const found = liveDeviceState.sceneTarget();
    await vi.advanceTimersByTimeAsync(SERIAL_LOOKUP_LIMIT_MS);
    expect(await found).toEqual({
      device: { platform: 'android', serial: 'emulator-5554' },
      app: { id: 'com.a.and' },
    });
  });

  it('an ANDROID_SERIAL that names no running phone is no phone even with a simulator booted', async () => {
    twoPhones(['ios'], BOTH_IDS);
    vi.stubEnv('ANDROID_SERIAL', 'emulator-9999');
    restores.push(() => vi.unstubAllEnvs());
    expect(await liveDeviceState.sceneTarget()).toEqual({ cause: 'no-phone', found: [] });
  });

  it('ANDROID_SERIAL picks the phone the capture runs on', async () => {
    androidsListed({ 'emulator-5554': 'EMU1', 'emulator-5556': 'EMU2' });
    vi.stubEnv('ANDROID_SERIAL', 'emulator-5556');
    restores.push(() => vi.unstubAllEnvs());
    expect(await liveDeviceState.sceneTarget()).toEqual({
      device: { platform: 'android', serial: 'emulator-5556' },
      app: { id: 'com.a.and' },
    });

    vi.stubEnv('ANDROID_SERIAL', 'emulator-9999');
    expect(await liveDeviceState.sceneTarget()).toEqual({ cause: 'no-phone', found: [] });
  });

  it('a project with no app id for any running phone is named no app id', async () => {
    twoPhones(['ios', 'android'], {});
    expect(await liveDeviceState.sceneTarget()).toEqual({
      cause: 'no-app-id',
      found: [
        { platform: 'ios', udid: 'SIM-1', hasApp: false },
        { platform: 'android', serial: 'emulator-5554', hasApp: false },
      ],
    });
  });
});
