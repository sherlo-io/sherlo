/**
 * A LOCAL SCENE RUNS ON A CLEAN DEVICE, AND THE DEVELOPER'S OWN DEVICE COMES BACK.
 *
 * The device is stood up as a recording shell: every tool call is kept, and the few answers a real
 * simulator or emulator gives are scripted. The app's container, the simulator's own folder and
 * the run's save folder are real folders under one scratch folder, so the copies the save and the
 * restore make are real copies.
 */
import fs from 'fs';
import net from 'net';
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
import {
  installDeviceState,
  liveDeviceState,
  prepareCleanDevice,
  saveScreenPicture,
} from '../deviceState';
import type { DeviceState, DeviceTool, SceneTarget } from '../deviceState';
import { saveDeviceState } from '../deviceStateSave';
import { restoreDeviceState } from '../deviceStateRestore';
import { appIdOf } from '../deviceStateAppId';
import { applySceneDevice } from '../sceneDevice';
import type { PhoneToSet } from '../sceneDevice';

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
/** What the emulator answers when asked for its global proxy: `null` when it has none. */
let earlierProxy = 'null';

beforeEach(() => {
  earlierProxy = 'null';
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'device-state-test-'));
  container = path.join(scratch, 'container');
  simulator = path.join(scratch, 'simulator');
  writeFiles(container, THE_DEVELOPERS_DATA);
  writeFiles(simulator, {
    'Library/BulletinBoard/VersionedSectionInfo.plist': 'notifications as I left them',
    'Library/Keychains/keychain-2.db': 'my logins',
    'Library/TCC/TCC.db': 'camera as I left it',
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

  it("a scene's denied permission is revoked and its location set before launch, and both are put back after", async () => {
    const field = {
      permissions: { camera: 'denied', notifications: 'denied' },
      location: { latitude: 52.5, longitude: 13.4 },
    } as const;

    const restoreIos = await prepareCleanDevice(IOS.device, IOS.app, field);
    expect(await applySceneDevice(IOS, field)).toEqual([]);
    expect(commands()).toContain('xcrun simctl privacy SIM-1 revoke camera com.example.app');
    expect(commands()).toContain(
      'applesimutils --byId SIM-1 --bundle com.example.app --setPermissions notifications=NO'
    );
    expect(commands()).toContain('xcrun simctl location SIM-1 set 52.5,13.4');
    // The revoke is a change to the simulator's privacy database.
    writeFiles(simulator, { 'Library/TCC/TCC.db': 'camera revoked by the scene' });
    calls = [];
    await restoreIos();
    expect(readFiles(simulator)['Library/TCC/TCC.db']).toBe('camera as I left it');
    expect(commands()).toContain('xcrun simctl spawn SIM-1 launchctl stop com.apple.tccd');
    expect(commands()).toContain('xcrun simctl location SIM-1 clear');

    calls = [];
    const restoreAndroid = await prepareCleanDevice(ANDROID.device, ANDROID.app, field);
    // The app's manifest declares the camera and the notifications; the phone is an emulator.
    expect(await applySceneDevice(ANDROID, field)).toEqual([]);
    expect(commands()).toContain(
      'adb -s emulator-5554 shell pm revoke com.example.app android.permission.CAMERA'
    );
    expect(commands()).toContain('adb -s emulator-5554 emu geo fix 13.4 52.5');
    calls = [];
    await restoreAndroid();
    // The camera was granted before the scene, so it is granted again; the phone goes back to
    // where `dumpsys location` last saw it.
    expect(commands()).toContain(
      'adb -s emulator-5554 shell pm grant com.example.app android.permission.CAMERA'
    );
    expect(commands()).toContain('adb -s emulator-5554 emu geo fix -70.25 40.5');
  });

  it('an emulator whose earlier location cannot be read is not moved, and the location is not applied', async () => {
    uninstall();
    uninstall = installDeviceState({
      ...recordingDevice(undefined),
      run: async (tool, args) => {
        calls.push({ tool, args });
        return args.includes('location')
          ? 'no location providers\n'
          : answerOf(`${tool} ${args.join(' ')}`, undefined);
      },
    });
    const field = { location: { latitude: 52.5, longitude: 13.4 } };

    expect(await applySceneDevice(ANDROID, field)).toEqual([
      { setting: 'location', wanted: '52.5,13.4', why: 'phone-refused' },
    ]);
    expect(commands().filter((line) => line.includes('geo fix'))).toEqual([]);
  });

  it('a permission the app does not declare is not applied, and the capture goes on', async () => {
    const field = { permissions: { calendar: 'granted' }, location: undefined } as const;

    expect(await applySceneDevice(ANDROID, field)).toEqual([
      { setting: 'calendar', wanted: 'granted', why: 'phone-refused' },
    ]);
    expect(commands().filter((line) => line.includes('pm grant'))).toEqual([]);
  });

  it('an app id comes from the project, and an id with shell characters is none', () => {
    const root = fs.mkdtempSync(path.join(scratch, 'project-'));
    writeFiles(root, {
      'app.json': JSON.stringify({ expo: { ios: { bundleIdentifier: 'a b;c' } } }),
    });

    expect(appIdOf('ios', root)).toBeUndefined();
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

  /** The port the refusing proxy listens on, as the emulator was told of it. */
  function proxyPortSet(): number {
    const put = commands().find((line) =>
      line.includes('settings put global http_proxy 10.0.2.2:')
    );
    return Number(put?.split(':').at(-1));
  }

  /** Whether anything listens on `port` of this machine. */
  function listensOn(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
    });
  }

  it("the Android emulator's proxy is set before a scene and put back after the run, even when it fails", async () => {
    uninstall();
    uninstall = installDeviceState(recordingDevice(ANDROID));
    const uninstallSocket = installCaptureSocket({
      captureStory: async () => {
        throw new Error('a scene capture asked about a story');
      },
      captureScene: async () => {
        // The scene runs while the emulator sends everything through the proxy.
        expect(await listensOn(proxyPortSet())).toBe(true);
        throw new Error('the app went away');
      },
    });

    try {
      await expect(capture({ [SCENE_OPTION]: 'inbox--full' })).rejects.toThrow('the app went away');
    } finally {
      uninstallSocket();
    }

    // The emulator had no proxy, so it is cleared again: the setting put to none, then deleted.
    const ran = commands();
    const none = ran.indexOf('adb -s emulator-5554 shell settings put global http_proxy :0');
    expect(none).toBeGreaterThan(ran.findIndex((line) => line.includes('http_proxy 10.0.2.2:')));
    expect(ran[none + 1]).toBe('adb -s emulator-5554 shell settings delete global http_proxy');
    expect(await listensOn(proxyPortSet())).toBe(false);
  });

  it('an iOS simulator is given no proxy, and an emulator that had one gets it back', async () => {
    const restoreIos = await prepareCleanDevice(IOS.device, IOS.app, undefined, 8081);
    await restoreIos();
    expect(commands().some((line) => line.includes('http_proxy'))).toBe(false);

    uninstall();
    uninstall = installDeviceState(recordingDevice(ANDROID));
    earlierProxy = 'corporate.example:3128';
    calls = [];
    const restoreAndroid = await prepareCleanDevice(ANDROID.device, ANDROID.app, undefined, 8081);
    await restoreAndroid();

    expect(commands()).toContain(
      'adb -s emulator-5554 shell settings put global http_proxy corporate.example:3128'
    );
  });

  it('a run that names no bundler port sets no proxy, as open does', async () => {
    uninstall();
    uninstall = installDeviceState(recordingDevice(ANDROID));

    const restore = await prepareCleanDevice(ANDROID.device, ANDROID.app);
    await restore();

    expect(commands().some((line) => line.includes('http_proxy'))).toBe(false);
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

describe('a screen picture that cannot be saved is a failed save', () => {
  it('a tool whose output has no folder to go to fails the run instead of crashing the process', async () => {
    const missing = path.join(scratch, 'no-such-folder', 'screen.png');

    // `node` stands in for adb: any program that prints bytes.
    await expect(
      liveDeviceState.run('node' as DeviceTool, ['-e', 'process.stdout.write("x")'], {
        stdoutTo: missing,
      })
    ).rejects.toThrow();
  });

  it('a save that fails leaves no file behind', async () => {
    const file = path.join(scratch, 'screen.png');
    uninstall();
    uninstall = installDeviceState({
      ...recordingDevice(undefined),
      run: async (_tool, _args, options) => {
        fs.writeFileSync(options?.stdoutTo ?? file, 'half a picture');
        throw new Error('adb failed');
      },
    });

    await expect(saveScreenPicture(ANDROID.device, file)).rejects.toThrow('adb failed');
    expect(fs.existsSync(file)).toBe(false);
  });

  it.each([
    ['ios', IOS.device],
    ['android', ANDROID.device],
  ])('a failed %s save keeps the picture already at the path', async (_name, device) => {
    const file = path.join(scratch, 'screen.png');
    fs.writeFileSync(file, 'the picture I had');
    uninstall();
    uninstall = installDeviceState({
      ...recordingDevice(undefined),
      // The tool opens whatever file it is handed and fails: the way adb truncates, and simctl does not.
      run: async (_tool, args, options) => {
        const target = options?.stdoutTo ?? args[args.length - 1];
        if (options?.stdoutTo) fs.writeFileSync(target, '');
        throw new Error('the tool failed');
      },
    });

    await expect(saveScreenPicture(device, file)).rejects.toThrow('the tool failed');
    expect(fs.readFileSync(file, 'utf8')).toBe('the picture I had');
    expect(fs.readdirSync(scratch).filter((name) => name.includes('.sherlo-'))).toEqual([]);
  });
});

describe("a scene's phone is set before the app starts", () => {
  const DECLARED = { permissions: ['camera', 'photos', 'contacts'], tracking: true } as const;
  const KEYCHAIN = 'Library/Keychains/keychain-2.db';

  /** Stand up the clean device and set the phone for one scene; answers what was not applied and the restore. */
  async function setPhone(target: SceneTarget, phone: PhoneToSet) {
    const restore = await prepareCleanDevice(target.device, target.app, phone);
    return { restore, notApplied: await applySceneDevice(target, phone) };
  }

  it('every declared permission is granted before the scene unless the scene denies it or asks for its dialog', async () => {
    const phone: PhoneToSet = {
      declared: { permissions: [...DECLARED.permissions], tracking: false },
      permissions: { camera: 'denied' },
    };
    const { restore } = await setPhone(IOS, phone);
    expect(commands()).toContain('xcrun simctl privacy SIM-1 revoke camera com.example.app');
    expect(commands()).toContain('xcrun simctl privacy SIM-1 grant photos com.example.app');
    expect(commands()).toContain('xcrun simctl privacy SIM-1 grant contacts com.example.app');
    await restore();

    calls = [];
    const fresh = await setPhone(IOS, { ...phone, member: 'fresh-install' });
    expect(commands()).toContain('xcrun simctl privacy SIM-1 revoke camera com.example.app');
    expect(commands()).toContain('xcrun simctl privacy SIM-1 reset photos com.example.app');
    expect(commands()).toContain('xcrun simctl spawn SIM-1 launchctl stop com.apple.SpringBoard');
    expect(commands().filter((line) => line.includes('grant'))).toEqual([]);
    await fresh.restore();

    calls = [];
    const android = await setPhone(ANDROID, {
      declared: { permissions: ['camera', 'notifications'], tracking: false },
      permissions: { notifications: 'denied' },
    });
    expect(commands()).toContain(
      'adb -s emulator-5554 shell pm grant com.example.app android.permission.CAMERA'
    );
    expect(commands()).toContain(
      'adb -s emulator-5554 shell pm revoke com.example.app android.permission.POST_NOTIFICATIONS'
    );
    await android.restore();
  });

  it("the iOS tracking permission is written to the phone's privacy store before the app starts", async () => {
    const { restore, notApplied } = await setPhone(IOS, {
      declared: { permissions: [], tracking: true },
    });
    writeFiles(simulator, { 'Library/TCC/TCC.db': 'tracking row written' });

    const write = calls.find((call) => call.tool === 'sqlite3');
    expect(notApplied).toEqual([]);
    expect(write?.args[0]).toBe(path.join(simulator, 'Library/TCC/TCC.db'));
    expect(write?.args[1]).toContain("'kTCCServiceUserTracking', 'com.example.app'");
    expect(commands().at(-1)).toBe('xcrun simctl spawn SIM-1 launchctl stop com.apple.tccd');
    await restore();
    expect(readFiles(simulator)['Library/TCC/TCC.db']).toBe('camera as I left it');
  });

  it("a fresh-install scene starts with the app's data and stored logins wiped", async () => {
    const ios = await setPhone(IOS, {
      member: 'fresh-install',
      declared: { ...DECLARED, permissions: [] },
    });
    expect(readFiles(container)).toEqual({});
    expect(commands()).toContain('xcrun simctl privacy SIM-1 reset all com.example.app');
    const wipe = calls.find((call) => call.tool === 'sqlite3');
    expect(wipe?.args[0]).toBe(path.join(simulator, KEYCHAIN));
    expect(wipe?.args[1]).toContain("DELETE FROM genp WHERE agrp = 'com.example.app'");
    writeFiles(simulator, { [KEYCHAIN]: 'wiped by the scene' });
    await ios.restore();
    expect(readFiles(container)).toEqual(THE_DEVELOPERS_DATA);
    expect(readFiles(simulator)[KEYCHAIN]).toBe('my logins');

    calls = [];
    const android = await setPhone(ANDROID, { member: 'fresh-install' });
    expect(commands()).toContain('adb -s emulator-5554 shell pm clear com.example.app');
    await android.restore();
  });

  it("a signed-out scene starts with the app's stored logins wiped and its other data kept", async () => {
    const { restore } = await setPhone(IOS, { member: 'signed-out' });

    expect(readFiles(container)).toEqual(THE_DEVELOPERS_DATA);
    expect(commands().filter((line) => line.includes('reset all'))).toEqual([]);
    const wipe = calls.find((call) => call.tool === 'sqlite3');
    expect(wipe?.args[0]).toBe(path.join(simulator, KEYCHAIN));
    expect(wipe?.args[1]).toContain("DELETE FROM genp WHERE agrp = 'com.example.app'");
    await restore();
  });

  it('a declared permission the phone refuses to grant is listed with why', async () => {
    uninstall();
    uninstall = installDeviceState({
      ...recordingDevice(undefined),
      run: async (tool, args) => {
        if (args.includes('grant') && args.includes('photos')) throw new Error('refused');
        return answerOf(`${tool} ${args.join(' ')}`, undefined);
      },
    });

    const { restore, notApplied } = await setPhone(IOS, {
      declared: { permissions: ['camera', 'photos'], tracking: false },
    });

    expect(notApplied).toEqual([{ setting: 'photos', wanted: 'granted', why: 'phone-refused' }]);
    await restore();
  });

  it('an app whose declared permissions cannot be read is listed with why', async () => {
    const { restore, notApplied } = await setPhone(IOS, {
      declared: { permissions: [], tracking: false, unreadable: true },
    });

    expect(notApplied).toEqual([
      { setting: 'permissions', wanted: 'every permission the app declares', why: 'phone-refused' },
    ]);
    await restore();
  });

  it('a setting the phone cannot apply comes back with why', async () => {
    uninstall();
    uninstall = installDeviceState({
      ...recordingDevice(undefined),
      run: async (tool, args) => {
        if (tool === 'sqlite3') throw new Error('database is locked');
        return answerOf(`${tool} ${args.join(' ')}`, undefined);
      },
    });

    const { restore, notApplied } = await setPhone(IOS, {
      member: 'signed-out',
      declared: { permissions: [], tracking: true },
    });

    expect(notApplied).toEqual([
      { setting: 'member', wanted: 'signed-out', why: 'phone-refused' },
      { setting: 'tracking', wanted: 'granted', why: 'phone-refused' },
    ]);
    await restore();
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
  if (line.includes('settings get global http_proxy')) return `${earlierProxy}\n`;
  if (line.includes('settings get global window_animation_scale')) return '1.0\n';
  if (line.includes('settings get global transition_animation_scale')) return '0.5\n';
  if (line.includes('settings get global animator_duration_scale')) return 'null\n';
  if (line.includes('dumpsys location')) {
    return '  last location=Location[gps 40.5,-70.25 hAcc=5 et=+1d vAcc=1]\n';
  }
  if (line.includes('dumpsys package com.example.app')) {
    return (
      '    runtime permissions:\n' +
      '      android.permission.POST_NOTIFICATIONS: granted=false, flags=[ USER_SENSITIVE_WHEN_GRANTED ]\n' +
      '      android.permission.CAMERA: granted=true, flags=[ ]\n'
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
