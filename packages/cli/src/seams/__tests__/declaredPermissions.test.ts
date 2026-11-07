import { afterEach, describe, expect, it } from 'vitest';
import { declaredPermissions } from '../declaredPermissions';
import { installDeviceState, posedDeviceState } from '../deviceState';
import type { SceneTarget } from '../deviceState';

const IOS: SceneTarget = {
  device: { platform: 'ios', udid: 'SIM-1' },
  app: { id: 'com.example.app' },
};
const ANDROID: SceneTarget = {
  device: { platform: 'android', serial: 'emulator-5554' },
  app: { id: 'com.example.app' },
};

let uninstall: () => void = () => undefined;

afterEach(() => uninstall());

/** A phone that answers the one lookup each test is about. */
function phoneAnswering(answer: (line: string) => string) {
  uninstall = installDeviceState({
    ...posedDeviceState(),
    run: async (tool, args) => answer(`${tool} ${args.join(' ')}`),
  });
}

describe("the app's declared permissions are read", () => {
  it('the permissions an iOS app declares are read from its Info.plist usage keys', async () => {
    phoneAnswering((line) => {
      if (line.includes('get_app_container')) return '/sim/App.app\n';
      expect(line).toBe('plutil -convert json -o - /sim/App.app/Info.plist');
      return JSON.stringify({
        NSCameraUsageDescription: 'to scan',
        NSPhotoLibraryAddUsageDescription: 'to save',
        NSLocationWhenInUseUsageDescription: 'to find you',
        NSUserTrackingUsageDescription: 'to measure ads',
      });
    });

    const declared = await declaredPermissions(IOS);

    expect([...declared.permissions].sort()).toEqual([
      'camera',
      'location',
      'notifications',
      'photos',
    ]);
    expect(declared.tracking).toBe(true);
  });

  it('an iOS app that declares no tracking key does not ask to track', async () => {
    phoneAnswering((line) =>
      line.includes('get_app_container') ? '/sim/App.app\n' : '{"NSCameraUsageDescription":"x"}'
    );

    expect((await declaredPermissions(IOS)).tracking).toBe(false);
  });

  it('the permissions an Android app declares are read from its merged manifest', async () => {
    phoneAnswering(
      () =>
        '  declared permissions:\n' +
        '    com.example.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION: prot=signature\n' +
        '  requested permissions:\n' +
        '    android.permission.INTERNET\n' +
        '    android.permission.CAMERA\n' +
        '    android.permission.POST_NOTIFICATIONS: restricted=false\n' +
        '  runtime permissions:\n' +
        '    android.permission.CAMERA: granted=false, flags=[ USER_SET]\n' +
        '    android.permission.POST_NOTIFICATIONS: granted=true, flags=[ ]\n'
    );

    const declared = await declaredPermissions(ANDROID);

    expect([...declared.permissions].sort()).toEqual(['camera', 'notifications']);
    expect(declared.tracking).toBe(false);
  });

  it('an app the phone will not show declares nothing and is marked unreadable', async () => {
    phoneAnswering(() => {
      throw new Error('simctl failed');
    });

    expect(await declaredPermissions(IOS)).toEqual({
      permissions: [],
      tracking: false,
      unreadable: true,
    });
  });
});
