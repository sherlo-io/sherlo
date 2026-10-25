/**
 * A LOCAL SCENE RUNS ON A CLEAN DEVICE, AND THE DEVELOPER'S OWN DEVICE COMES BACK.
 *
 * The device is stood up as a recording shell: every tool call is kept, and the few answers a real
 * simulator or emulator gives are scripted. The app's container, the simulator's own folder and
 * the run's save folder are real folders under one scratch folder, so the copies the save and the
 * restore make are real copies.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import capture from '../../commands/capture/capture';
import open from '../../commands/open/open';
import { SCENE_OPTION } from '../../constants';
import { captureTranscript } from '../../helpers/transcriptSink';
import { installCaptureSocket } from '../captureSocket';
import type { CaptureSocket } from '../captureSocket';
import { installLetterbox } from '../letterbox';
import type { Letterbox } from '../letterbox';
import { installProjectFiles } from '../projectFiles';
import { installDeviceState, liveDeviceState, prepareCleanDevice } from '../deviceState';
import type { DeviceState, DeviceTool, SceneTarget } from '../deviceState';
import { SERIAL_LOOKUP_LIMIT_MS } from '../deviceStateAndroids';
import { saveDeviceState } from '../deviceStateSave';
import { restoreDeviceState } from '../deviceStateRestore';

const IOS: SceneTarget = {
  device: { platform: 'ios', udid: 'SIM-1' },
  app: { id: 'com.example.app' },
};
const ANDROID: SceneTarget = {
  device: { platform: 'android', serial: 'emulator-5554' },
  app: { id: 'com.example.app' },
};

const THE_DEVELOPERS_DATA = {
  'Documents/notes.txt': 'my notes',
  'Library/Preferences/com.example.app.plist': 'my settings',
  'tmp/draft.txt': 'my draft',
};

type Call = { tool: DeviceTool; args: string[]; stdoutTo?: string; stdin?: string };

let scratch: string;
let container: string;
let simulator: string;
let saveFolders: string[];
let calls: Call[];
let uninstall: () => void;

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'device-state-test-'));
  container = path.join(scratch, 'container');
  simulator = path.join(scratch, 'simulator');
  writeFiles(container, THE_DEVELOPERS_DATA);
  writeFiles(simulator, {
    'Library/BulletinBoard/VersionedSectionInfo.plist': 'notifications as I left them',
    'Library/Keychains/keychain-2.db': 'my logins',
  });
  saveFolders = [];
  calls = [];
  uninstall = installDeviceState(recordingDevice(undefined));
});

afterEach(() => {
  uninstall();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('a local capture leaves the device clean', () => {
  it("the app's data is saved, wiped, and put back when the capture ends", async () => {
    const restore = await prepareCleanDevice(IOS.device, IOS.app);

    expect(readFiles(container)).toEqual({});
    expect(commands()).toContain(
      'xcrun simctl spawn SIM-1 defaults write com.apple.Accessibility ReduceMotionEnabled -bool true'
    );
    expect(commands()).toContain(
      'applesimutils --byId SIM-1 --bundle com.example.app --setPermissions notifications=YES'
    );
    expect(readFiles(saveFolders[0])).toMatchObject({
      'data/Documents/notes.txt': 'my notes',
      'data/tmp/draft.txt': 'my draft',
    });

    // The scene runs, and the app writes its own data on the clean device.
    writeFiles(container, { 'Documents/scene.txt': 'written by the scene' });
    calls = [];

    await restore();

    expect(commands()[0]).toBe('xcrun simctl terminate SIM-1 com.example.app');
    expect(readFiles(container)).toEqual(THE_DEVELOPERS_DATA);
    expect(readFiles(simulator)['Library/BulletinBoard/VersionedSectionInfo.plist']).toBe(
      'notifications as I left them'
    );
    expect(commands()).toContain(
      'xcrun simctl spawn SIM-1 defaults write com.apple.Accessibility ReduceMotionEnabled -bool false'
    );
    expect(fs.existsSync(saveFolders[0])).toBe(false);
  });

  it('a failed capture puts everything back', async () => {
    uninstall();
    uninstall = installDeviceState(recordingDevice(ANDROID));
    const socket: CaptureSocket = {
      captureStory: async () => {
        throw new Error('a scene capture asked about a story');
      },
      captureScene: async () => {
        throw new Error('the app went away');
      },
    };
    const uninstallSocket = installCaptureSocket(socket);

    try {
      await expect(capture({ [SCENE_OPTION]: 'inbox--full' })).rejects.toThrow('the app went away');
    } finally {
      uninstallSocket();
    }

    const ran = commands();
    expect(ran).toContain(
      'adb -s emulator-5554 shell settings put global window_animation_scale 0'
    );
    expect(ran).toContain(
      'adb -s emulator-5554 shell pm grant com.example.app android.permission.POST_NOTIFICATIONS'
    );
    const stopped = ran.lastIndexOf('adb -s emulator-5554 shell am force-stop com.example.app');
    expect(ran.slice(stopped)).toEqual(
      expect.arrayContaining([
        'adb -s emulator-5554 shell settings put global window_animation_scale 1.0',
        'adb -s emulator-5554 shell settings put global transition_animation_scale 0.5',
        'adb -s emulator-5554 shell settings delete global animator_duration_scale',
        'adb -s emulator-5554 shell pm revoke com.example.app android.permission.POST_NOTIFICATIONS',
        'adb -s emulator-5554 shell run-as com.example.app tar -xf -',
      ])
    );
    expect(calls.find((call) => call.stdin !== undefined)?.stdin).toBe('the app data as I left it');
    expect(fs.existsSync(saveFolders[0])).toBe(false);
  });

  it('an interrupt puts everything back', async () => {
    uninstall();
    uninstall = installDeviceState(recordingDevice(IOS));
    const app: Letterbox = {
      openStory: async () => {
        throw new Error('a scene open asked about a story');
      },
      openScene: async ({ sceneId }) => ({ kind: 'scene-opened', sceneId, route: ['Inbox'] }),
    };
    const uninstallApp = installLetterbox(app);
    const exits: Array<number | undefined> = [];
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exits.push(code);
    }) as never);
    const listenersBefore = process.listenerCount('SIGINT');

    try {
      await captureTranscript(async () => {
        const opened = open({ [SCENE_OPTION]: 'inbox--full' });
        // `open` keeps the scene on its clean device until the developer stops the command.
        await vi.waitFor(() => expect(process.listenerCount('SIGINT')).toBe(listenersBefore + 1));
        await vi.waitFor(() => expect(readFiles(container)).toEqual({}));

        // The developer presses Ctrl-C: the signal reaches the process's own listeners.
        (process.emit as (event: string) => boolean)('SIGINT');
        await opened;
      });
      await vi.waitFor(() => expect(exits).toEqual([130]));
    } finally {
      exit.mockRestore();
      uninstallApp();
    }

    expect(readFiles(container)).toEqual(THE_DEVELOPERS_DATA);
    expect(commands()).toContain(
      'xcrun simctl spawn SIM-1 defaults write com.apple.Accessibility ReduceMotionEnabled -bool false'
    );
    expect(process.listenerCount('SIGINT')).toBe(listenersBefore);
  });

  it('an app that is not installed ends as no app attached, and nothing on the device is touched', async () => {
    uninstall();
    const device = recordingDevice(IOS);
    uninstall = installDeviceState({
      ...device,
      run: async (tool, args, options) => {
        if (args.includes('get_app_container')) throw new Error('No such app');
        return device.run(tool, args, options);
      },
    });
    let reachedTheApp = false;
    const uninstallSocket = installCaptureSocket({
      captureStory: async () => ({ kind: 'no-app' }),
      captureScene: async () => {
        reachedTheApp = true;
        return { kind: 'no-app', why: 'never-said-hello' };
      },
    });
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    let printed = '';
    try {
      const transcript = await captureTranscript(() => capture({ [SCENE_OPTION]: 'inbox--full' }));
      printed = transcript.stdout + transcript.stderr;
    } finally {
      exit.mockRestore();
      uninstallSocket();
    }

    expect(printed).toContain('no Sherlo app is attached');
    expect(reachedTheApp).toBe(false);
    expect(commands()).toEqual([]);
    expect(readFiles(container)).toEqual(THE_DEVELOPERS_DATA);
  });

  it.each([
    ['capture', capture],
    ['open', open],
  ])(
    '%s --scene on an Android build that is not debuggable prints the debug build line',
    async (_name, command) => {
      uninstall();
      const device = recordingDevice(ANDROID);
      uninstall = installDeviceState({
        ...device,
        run: async (tool, args, options) => {
          if (args.includes('run-as')) {
            throw new Error(
              `adb ${args.join(' ')} failed: run-as: package not debuggable: com.example.app`
            );
          }
          return device.run(tool, args, options);
        },
      });
      let reachedTheApp = false;
      const uninstallSocket = installCaptureSocket({
        captureStory: async () => ({ kind: 'no-app' }),
        captureScene: async () => {
          reachedTheApp = true;
          return { kind: 'no-app', why: 'never-said-hello' };
        },
      });
      const uninstallApp = installLetterbox({
        openStory: async () => ({ kind: 'no-app' }),
        openScene: async () => {
          reachedTheApp = true;
          return { kind: 'no-app', why: 'never-said-hello' };
        },
      });
      let printed = '';
      try {
        const transcript = await captureTranscript(() =>
          command({ [SCENE_OPTION]: 'inbox--full' }).catch((error: Error) => {
            printed += error.message;
          })
        );
        printed += transcript.stdout + transcript.stderr;
      } finally {
        uninstallSocket();
        uninstallApp();
      }

      expect(printed).toContain(
        'This build is not a debug build, so Sherlo cannot read its data on the device. ' +
          'Install a debug build of your app (the debug variant, not release) and run the command again.'
      );
      expect(printed).not.toContain('run-as');
      expect(printed).toContain('ERROR:');
      expect(reachedTheApp).toBe(false);
    }
  );

  it('a lost device or an unknown package is not called a non-debug build', async () => {
    const lostDevice = 'adb: device offline while running run-as com.example.app';
    const unknownPackage = 'run-as: unknown package: com.example.app';
    for (const text of [lostDevice, unknownPackage]) {
      uninstall();
      const device = recordingDevice(ANDROID);
      uninstall = installDeviceState({
        ...device,
        run: async (tool, args, options) => {
          if (args.includes('run-as')) throw new Error(text);
          return device.run(tool, args, options);
        },
      });

      const refusal = await prepareCleanDevice(ANDROID.device, ANDROID.app).then(
        () => undefined,
        (error: unknown) => error
      );

      expect(refusal).toBeInstanceOf(Error);
      expect((refusal as Error).name).not.toBe('NotDebuggableBuild');
      expect((refusal as Error).message).toContain(text);
    }
  });

  it('the keychain is never touched locally', async () => {
    for (const target of [IOS, ANDROID]) {
      const folder = fs.mkdtempSync(path.join(scratch, 'saved-'));
      const saved = await saveDeviceState(target.device, target.app, folder);
      await restoreDeviceState(target.device, target.app, saved);
      const restore = await prepareCleanDevice(target.device, target.app);
      await restore();
    }

    expect(commands().filter((line) => /keychain/i.test(line))).toEqual([]);
    expect(readFiles(simulator)['Library/Keychains/keychain-2.db']).toBe('my logins');
  });
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
        ...recordingDevice(undefined),
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
    restores.push(
      installDeviceState({ ...recordingDevice(undefined), run: async () => 'package:/x' })
    );
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

/* ========================================================================== */

/** A device that answers the way a simulator or an emulator does, and keeps every call. */
function recordingDevice(target: SceneTarget | undefined): DeviceState {
  return {
    sceneTarget: async () => target ?? { cause: 'no-phone', found: [] },
    simulatorFolder: () => simulator,
    makeSaveFolder: () => {
      const folder = fs.mkdtempSync(path.join(scratch, 'sherlo-clean-device-'));
      saveFolders.push(folder);
      return folder;
    },
    run: async (tool, args, options = {}) => {
      const call: Call = { tool, args };
      if (options.stdoutTo) call.stdoutTo = options.stdoutTo;
      if (options.stdinFrom) call.stdin = fs.readFileSync(options.stdinFrom, 'utf8');
      calls.push(call);
      return answerOf(`${tool} ${args.join(' ')}`, options.stdoutTo);
    },
  };
}

function answerOf(line: string, stdoutTo: string | undefined): string {
  if (line.includes('get_app_container')) return `${container}\n`;
  if (line.includes('pm path com.example.app')) return 'package:/data/app/example/base.apk\n';
  if (line.includes('defaults read com.apple.Accessibility ReduceMotionEnabled')) return '0\n';
  if (line.startsWith('applesimutils')) {
    const bulletins = path.join(simulator, 'Library/BulletinBoard/VersionedSectionInfo.plist');
    fs.writeFileSync(bulletins, 'notifications granted by the scene');
  }
  if (line.includes('tar -cf -') && stdoutTo) {
    fs.writeFileSync(stdoutTo, 'the app data as I left it');
  }
  if (line.includes('settings get global window_animation_scale')) return '1.0\n';
  if (line.includes('settings get global transition_animation_scale')) return '0.5\n';
  if (line.includes('settings get global animator_duration_scale')) return 'null\n';
  if (line.includes('dumpsys package com.example.app')) {
    return (
      '    runtime permissions:\n' +
      '      android.permission.POST_NOTIFICATIONS: granted=false, flags=[ USER_SENSITIVE_WHEN_GRANTED ]\n'
    );
  }
  return '';
}

function commands(): string[] {
  return calls.map((call) => `${call.tool} ${call.args.join(' ')}`);
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
}

function readFiles(root: string, under = ''): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(root, under), { withFileTypes: true })) {
    const name = path.join(under, entry.name);
    if (entry.isDirectory()) Object.assign(files, readFiles(root, name));
    else files[name] = fs.readFileSync(path.join(root, name), 'utf8');
  }
  return files;
}
