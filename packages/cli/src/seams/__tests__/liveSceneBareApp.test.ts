/**
 * The launch of a plain React Native app (no Expo development launcher) on a bundler that is not on
 * 8081. Nothing listens on the port: the launch commands are what the fake runner records.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { STABILIZATION_SETTINGS } from '../bundlerLine';
import { captureLiveScene } from '../liveScene';
import { installDeviceState, posedDeviceState } from '../deviceState';
import type { SceneTarget } from '../deviceState';
import { restoreDeviceState } from '../deviceStateRestore';
import { saveDeviceState } from '../deviceStateSave';
import type { SavedDevice } from '../deviceStateSave';

const SCENE = 'chat--conversation';
const PORT = 61743;
const IOS: SceneTarget = {
  device: { platform: 'ios', udid: 'UDID-1' },
  app: { id: 'com.example.chat' },
};
const ANDROID: SceneTarget = {
  device: { platform: 'android', serial: 'emulator-5554' },
  app: { id: 'com.example.chat' },
};

/** What the save found on an Android phone whose `adb reverse` list was `reversed`. */
function androidSaved(reversed: string[] | null): SavedDevice {
  return {
    platform: 'android',
    folder: '/nowhere',
    dataTar: '/nowhere/data.tar',
    scales: {
      window_animation_scale: '1.0',
      transition_animation_scale: '1.0',
      animator_duration_scale: '1.0',
    },
    notifications: 'not-asked',
    reversed,
  };
}

/** Capture on `target` with the fake runner and answer the commands it ran. */
async function launchCommands(target: SceneTarget, port: number): Promise<string[]> {
  const ran: string[] = [];
  const uninstall = installDeviceState({
    ...posedDeviceState(),
    run: async (tool, args) => {
      ran.push(`${tool} ${args.join(' ')}`);
      return args.includes('resolve-activity') ? 'com.example.chat/.ChatActivity\n' : '';
    },
  });
  try {
    await captureLiveScene({ sceneId: SCENE, port, settings: STABILIZATION_SETTINGS, target });
  } finally {
    uninstall();
  }
  return ran;
}

describe('a plain React Native app is handed the bundler port', () => {
  it("a plain React Native app on iOS is told the bundler's port before it is launched", async () => {
    const ran = await launchCommands(IOS, PORT);

    const write = ran.indexOf(
      `xcrun simctl spawn UDID-1 defaults write com.example.chat RCT_jsLocation localhost:${PORT}`
    );
    const launch = ran.findIndex((command) => command.startsWith('xcrun simctl launch'));
    expect(write).toBeGreaterThan(-1);
    expect(write).toBeLessThan(launch);
  });

  it('a plain React Native app on Android is told the bundler address in its preferences and reaches it through adb reverse', async () => {
    const ran = await launchCommands(ANDROID, PORT);

    const prefs = ran.findIndex((command) => {
      const encoded =
        /run-as com\.example\.chat sh -c .*echo (\S+) \| base64 -d > \S+com\.example\.chat_preferences\.xml/.exec(
          command
        )?.[1];
      return (
        encoded !== undefined &&
        Buffer.from(encoded, 'base64')
          .toString()
          .includes(`name="debug_http_host">localhost:${PORT}<`)
      );
    });
    const reverse = ran.indexOf(`adb -s emulator-5554 reverse tcp:${PORT} tcp:${PORT}`);
    const start = ran.findIndex((command) => command.includes('shell am start'));
    expect(prefs).toBeGreaterThan(-1);
    expect(reverse).toBeGreaterThan(-1);
    expect(prefs).toBeLessThan(start);
    expect(reverse).toBeLessThan(start);
  });

  it("the phone's adb reverse mappings are put back as they were, the ones the capture added removed", async () => {
    const ran: string[] = [];
    const uninstall = installDeviceState({
      ...posedDeviceState(),
      run: async (tool, args) => {
        ran.push(`${tool} ${args.join(' ')}`);
        return args.includes('--list')
          ? `(reverse) tcp:${PORT} tcp:${PORT}\n(reverse) tcp:9 tcp:9\n`
          : '';
      },
    });
    try {
      await restoreDeviceState(
        ANDROID.device,
        ANDROID.app,
        androidSaved(['tcp:9 tcp:9', 'tcp:7 tcp:7'])
      );
    } finally {
      uninstall();
    }

    expect(ran).toContain(`adb -s emulator-5554 reverse --remove tcp:${PORT}`);
    expect(ran).toContain('adb -s emulator-5554 reverse tcp:7 tcp:7');
    expect(ran).not.toContain('adb -s emulator-5554 reverse --remove tcp:9');
  });

  it('a phone that would not list its adb reverse mappings at the save has none removed or added at the restore', async () => {
    const ran: string[] = [];
    let lists = 0;
    const uninstall = installDeviceState({
      ...posedDeviceState(),
      run: async (tool, args) => {
        ran.push(`${tool} ${args.join(' ')}`);
        if (!args.includes('--list')) return '';
        // The save asks first and gets no answer; the restore asks later and is told.
        if (++lists === 1) throw new Error('adb: device offline');
        return `(reverse) tcp:9 tcp:9\n(reverse) tcp:${PORT} tcp:${PORT}\n`;
      },
    });
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-app-test-'));
    try {
      const saved = await saveDeviceState(ANDROID.device, ANDROID.app, folder);
      expect(saved.platform === 'android' && saved.reversed).toBeNull();
      await restoreDeviceState(ANDROID.device, ANDROID.app, saved);
    } finally {
      uninstall();
      fs.rmSync(folder, { recursive: true, force: true });
    }

    expect(
      ran.filter((command) => / reverse /.test(command) && !command.endsWith('--list'))
    ).toEqual([]);
  });

  it("the iOS app's bundler address is deleted, or written back as it was, through the defaults tool", async () => {
    const ran: string[] = [];
    const uninstall = installDeviceState({
      ...posedDeviceState(),
      run: async (tool, args) => {
        ran.push(`${tool} ${args.join(' ')}`);
        return '';
      },
    });
    const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-app-test-'));
    const saved = (jsLocation: string | null): SavedDevice => ({
      platform: 'ios',
      folder: nowhere,
      container: nowhere,
      parts: [],
      reduceMotion: null,
      hadBulletins: false,
      jsLocation,
    });
    try {
      await restoreDeviceState(IOS.device, IOS.app, saved(null));
      await restoreDeviceState(IOS.device, IOS.app, saved('localhost:9000'));
    } finally {
      uninstall();
      fs.rmSync(nowhere, { recursive: true, force: true });
    }

    expect(ran).toContain(
      'xcrun simctl spawn UDID-1 defaults delete com.example.chat RCT_jsLocation'
    );
    expect(ran).toContain(
      'xcrun simctl spawn UDID-1 defaults write com.example.chat RCT_jsLocation localhost:9000'
    );
  });
});
