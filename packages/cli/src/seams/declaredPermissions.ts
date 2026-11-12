/**
 * THE PERMISSIONS THE BUILT APP DECLARES - read from the app on the phone, so a scene can have every
 * one of them answered before it launches.
 *
 *     iOS      the `NS...UsageDescription` keys of the installed app's Info.plist; the tracking
 *              prompt is the `NSUserTrackingUsageDescription` key.
 *     Android  the runtime permissions of the merged manifest, as `dumpsys package` lists them.
 *
 * Nothing here fails a capture: an app that cannot be read is marked `unreadable` (the capture lists
 * it as not applied), and the scene's own settings are still applied.
 */
import path from 'path';
import type { ScenePermission } from '../../../react-native-storybook/metro/sceneFiles';
import { deviceState } from './deviceState';
import type { SceneTarget } from './deviceState';
import { androidPermissionStates, POST_NOTIFICATIONS } from './deviceStateSave';

/** Each scene permission by the name each platform gives it: the one table. */
export const PLATFORM_NAMES: Record<ScenePermission, { ios: string; android: string[] }> = {
  camera: { ios: 'camera', android: ['android.permission.CAMERA'] },
  microphone: { ios: 'microphone', android: ['android.permission.RECORD_AUDIO'] },
  photos: {
    ios: 'photos',
    android: ['android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_EXTERNAL_STORAGE'],
  },
  contacts: { ios: 'contacts', android: ['android.permission.READ_CONTACTS'] },
  location: {
    ios: 'location',
    android: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
  },
  // iOS notifications are set with `applesimutils`, not `simctl privacy`.
  notifications: { ios: 'notifications', android: [POST_NOTIFICATIONS] },
  calendar: { ios: 'calendar', android: ['android.permission.READ_CALENDAR'] },
};

/** The Info.plist usage keys that declare each scene permission. */
const IOS_USAGE_KEYS: Record<string, ScenePermission> = {
  NSCameraUsageDescription: 'camera',
  NSMicrophoneUsageDescription: 'microphone',
  NSPhotoLibraryUsageDescription: 'photos',
  NSPhotoLibraryAddUsageDescription: 'photos',
  NSContactsUsageDescription: 'contacts',
  NSLocationWhenInUseUsageDescription: 'location',
  NSLocationAlwaysAndWhenInUseUsageDescription: 'location',
  NSLocationAlwaysUsageDescription: 'location',
  NSCalendarsUsageDescription: 'calendar',
  NSCalendarsFullAccessUsageDescription: 'calendar',
};

/** What the app declares: the scene permissions it can be asked for, and whether it asks to track. */
export type DeclaredPermissions = {
  permissions: ScenePermission[];
  tracking: boolean;
  /** The phone would not show the app's declarations, so none could be answered. */
  unreadable?: true;
};

/** Read what the app on the phone declares; an app that cannot be read is marked `unreadable`. */
export async function declaredPermissions(target: SceneTarget): Promise<DeclaredPermissions> {
  const { device, app } = target;
  const { run } = deviceState();
  try {
    if (device.platform === 'ios') {
      const bundle = (
        await run('xcrun', ['simctl', 'get_app_container', device.udid, app.id])
      ).trim();
      const plist = JSON.parse(
        await run('plutil', ['-convert', 'json', '-o', '-', path.join(bundle, 'Info.plist')])
      ) as Record<string, unknown>;
      // iOS has no usage key for notifications: every app can ask for them.
      const permissions = new Set<ScenePermission>(['notifications']);
      for (const [key, name] of Object.entries(IOS_USAGE_KEYS)) {
        if (key in plist) permissions.add(name);
      }
      return { permissions: [...permissions], tracking: 'NSUserTrackingUsageDescription' in plist };
    }
    const states = await androidPermissionStates(device.serial, app);
    const permissions = (Object.keys(PLATFORM_NAMES) as ScenePermission[]).filter((name) =>
      PLATFORM_NAMES[name].android.some((permission) => permission in states)
    );
    return { permissions, tracking: false };
  } catch {
    // The phone would not show the app's declarations: the scene's own settings are still applied.
    return { permissions: [], tracking: false, unreadable: true };
  }
}
