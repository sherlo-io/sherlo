import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDeviceState } from '../deviceState';
import type { DeviceState, SceneTarget } from '../deviceState';
import { applySceneDevice, saveSceneDevice } from '../sceneDevice';

const IOS: SceneTarget = {
  device: { platform: 'ios', udid: 'SIM-1' },
  app: { id: 'com.example.app' },
};

let scratch: string;
let keychains: string;
let sqliteTargets: string[];
let uninstall: () => void;

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-device-'));
  keychains = path.join(scratch, 'simulator', 'Library', 'Keychains');
  fs.mkdirSync(keychains, { recursive: true });
  sqliteTargets = [];
  const device: DeviceState = {
    sceneTarget: async () => IOS,
    run: async (tool, args) => {
      if (tool === 'sqlite3') sqliteTargets.push(args[0]);
      return '';
    },
    simulatorFolder: () => path.join(scratch, 'simulator'),
    makeSaveFolder: () => fs.mkdtempSync(path.join(scratch, 'save-')),
  };
  uninstall = installDeviceState(device);
});

afterEach(() => {
  uninstall();
  fs.rmSync(scratch, { recursive: true, force: true });
});

function touch(...files: string[]): void {
  for (const file of files) fs.writeFileSync(path.join(keychains, file), '');
}

describe('the device a signed-out scene starts on', () => {
  it('a signed-out scene on a simulator that keeps a debug keychain wipes the debug keychain and its -wal and -shm files', async () => {
    touch(
      'keychain-2.db',
      'keychain-2-debug.db',
      'keychain-2-debug.db-wal',
      'keychain-2-debug.db-shm'
    );

    await applySceneDevice(IOS, { member: 'signed-out' });
    const saved = await saveSceneDevice(
      IOS.device,
      IOS.app,
      { member: 'signed-out' },
      path.join(scratch, 'saved')
    );

    expect(sqliteTargets).toEqual([path.join(keychains, 'keychain-2-debug.db')]);
    expect(saved.iosKeychain).toEqual(
      expect.arrayContaining([
        'keychain-2-debug.db',
        'keychain-2-debug.db-wal',
        'keychain-2-debug.db-shm',
      ])
    );
  });

  it('a signed-out scene on a simulator with only the classic keychain still wipes keychain-2.db', async () => {
    touch('keychain-2.db');

    await applySceneDevice(IOS, { member: 'signed-out' });

    expect(sqliteTargets).toEqual([path.join(keychains, 'keychain-2.db')]);
  });
});
