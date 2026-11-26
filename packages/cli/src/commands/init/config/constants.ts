import path from 'path';
import { getCwd } from '../../../helpers';
import { readProjectJson } from '../../../helpers/projectJson';
import { readIfThere } from '../../../seams/iosConfiguration';

export const EVENT = '5_config';

const IPHONE = {
  id: 'iphone.15.pro',
  osVersion: '17',
} as const;

const DEFAULT_DEVICES = [
  IPHONE,
  {
    id: 'pixel.7.pro',
    osVersion: '13',
  } as const,
];

const ANDROID_14_DEVICES = [
  IPHONE,
  {
    id: 'pixel.8',
    osVersion: '14',
  } as const,
];

/** The newest Android API level the default phone (Android 13) installs an app on. */
const DEFAULT_PHONE_API_LEVEL = 33;

/** The files a React Native app states its lowest Android in. */
const MIN_SDK_FILES = [
  'android/build.gradle',
  'android/app/build.gradle',
  'android/gradle.properties',
];

/** The app's lowest Android API level (`minSdkVersion` or `minSdk`), or undefined when no file states a number. */
function readMinSdk(root: string): number | undefined {
  for (const file of MIN_SDK_FILES) {
    const text = readIfThere(path.join(root, file)) ?? '';
    const found = /\bminSdk(?:Version)?\s*[=\s]\s*(\d+)/.exec(text)?.[1];
    if (found) return Number(found);
  }

  const plugins: unknown[] = readProjectJson(root, 'app.json')?.expo?.plugins ?? [];
  for (const plugin of plugins) {
    if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
      const level = Number(plugin[1]?.android?.minSdkVersion);
      if (level) return level;
    }
  }

  return undefined;
}

/** The devices setup writes: an app that needs Android 14 gets a phone on 14, every other app the defaults. */
export function defaultDevicesFor(root: string = getCwd()) {
  const minSdk = readMinSdk(root);

  return minSdk !== undefined && minSdk > DEFAULT_PHONE_API_LEVEL
    ? ANDROID_14_DEVICES
    : DEFAULT_DEVICES;
}
