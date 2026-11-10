/**
 * Which port the app on the device asks for its bundler, read through the device seam with a fake
 * runner that answers the few commands the read sends.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { appBundlerPort, withPortTheAppAsks } from '../appBundlerPort';
import { installDeviceState, posedDeviceState } from '../deviceState';
import type { SceneTarget } from '../deviceState';

const IOS: SceneTarget = {
  device: { platform: 'ios', udid: 'UDID-1' },
  app: { id: 'com.example.chat' },
};
const PHONE: SceneTarget = {
  device: { platform: 'android', serial: 'R58M123' },
  app: { id: 'com.example.chat' },
};
const EMULATOR: SceneTarget = {
  device: { platform: 'android', serial: 'emulator-5554' },
  app: { id: 'com.example.chat' },
};
const NO_APP = { kind: 'no-app' as const };

/** What the fake device says: each command's printout, or an error for a command that fails. */
type Device = {
  jsLocation?: string;
  infoPlist?: string;
  reversed?: string;
  failing?: boolean;
};

let uninstall: () => void = () => {};
afterEach(() => uninstall());

function onDevice(device: Device): void {
  uninstall = installDeviceState({
    ...posedDeviceState(),
    sceneTarget: async () => IOS,
    run: async (tool, args) => {
      if (device.failing) throw new Error('the device tool failed');
      const command = `${tool} ${args.join(' ')}`;
      if (command.includes('get_app_container')) return '/apps/Chat.app\n';
      if (command.includes('plutil')) return device.infoPlist ?? '';
      if (command.includes('RCT_jsLocation')) {
        if (device.jsLocation === undefined) {
          throw new Error('The domain/default pair does not exist');
        }
        return `${device.jsLocation}\n`;
      }
      if (command.includes('reverse --list')) return device.reversed ?? '';
      return '';
    },
  });
}

describe('the bundler port an iOS simulator app is asked for', () => {
  it('an iOS simulator app with no saved bundler location asks the default port', async () => {
    onDevice({});

    expect(await appBundlerPort(IOS)).toEqual({
      platform: 'ios',
      port: 8081,
      udid: 'UDID-1',
      appId: 'com.example.chat',
    });
  });

  it("an iOS simulator app with a saved bundler location asks that location's port", async () => {
    onDevice({ jsLocation: 'localhost:8089' });

    expect(await appBundlerPort(IOS)).toMatchObject({ platform: 'ios', port: 8089 });
  });

  it('an iOS simulator app saved with a bare host asks the default port, as React Native adds it', async () => {
    onDevice({ jsLocation: 'localhost' });

    expect(await appBundlerPort(IOS)).toMatchObject({ port: 8081 });
  });

  it('an iOS simulator app with an Expo development launcher is not said to ask any port, as its launcher chose the bundler', async () => {
    onDevice({ infoPlist: '"CFBundleURLSchemes" => [ 0 => "exp+chat" ]' });

    expect(await appBundlerPort(IOS)).toBeUndefined();
  });
});

describe('the bundler port an Android app is asked for', () => {
  it('an Android phone asks 8081 on itself, which reaches the machine port its adb reverse mapping names', async () => {
    onDevice({ reversed: 'UsbFfs tcp:8081 tcp:8089\n' });

    expect(await appBundlerPort(PHONE)).toEqual({
      platform: 'android',
      port: 8089,
      serial: 'R58M123',
    });
  });

  it('an Android phone with no mapping of 8081 asks 8081', async () => {
    onDevice({ reversed: 'UsbFfs tcp:8089 tcp:8089\n' });

    expect(await appBundlerPort(PHONE)).toMatchObject({ port: 8081 });
  });

  it('an Android emulator is not said to ask any port, as it asks the machine itself', async () => {
    onDevice({});

    expect(await appBundlerPort(EMULATOR)).toBeUndefined();
  });
});

describe('the port the app asks is news only when the capture used another', () => {
  it('a no-app ending on another port than the app asks carries that port, and on its port adds nothing', async () => {
    onDevice({ jsLocation: 'localhost:8089' });

    expect(await withPortTheAppAsks(NO_APP, 8089, IOS)).toEqual(NO_APP);
    expect(await withPortTheAppAsks(NO_APP, 8081, IOS)).toMatchObject({
      kind: 'no-app',
      appAsks: { port: 8089 },
    });
  });

  it('an ending that found an app is never read for a port', async () => {
    onDevice({ jsLocation: 'localhost:8089' });

    expect(await withPortTheAppAsks({ kind: 'no-bundler' }, 8081, IOS)).toEqual({
      kind: 'no-bundler',
    });
  });

  it('a device whose tools fail adds nothing, rather than a guess', async () => {
    onDevice({ failing: true });

    expect(await withPortTheAppAsks(NO_APP, 8089, IOS)).toEqual(NO_APP);
  });

  it('a capture with no phone to read adds nothing', async () => {
    expect(await withPortTheAppAsks(NO_APP, 8089, { cause: 'no-phone', found: [] })).toEqual(
      NO_APP
    );
  });

  it('a capture handed no target reads the phone the device seam finds', async () => {
    onDevice({ jsLocation: 'localhost:8089' });

    expect(await withPortTheAppAsks(NO_APP, 8081)).toMatchObject({
      appAsks: { platform: 'ios', port: 8089 },
    });
  });
});
