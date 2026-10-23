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
import { installDeviceState, prepareCleanDevice } from '../deviceState';
import type { DeviceState, DeviceTool, SceneTarget } from '../deviceState';
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

/* ========================================================================== */

/** A device that answers the way a simulator or an emulator does, and keeps every call. */
function recordingDevice(target: SceneTarget | undefined): DeviceState {
  return {
    sceneTarget: async () => target,
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
