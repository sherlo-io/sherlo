/**
 * HOW STORYBOOK'S ROOT IS REGISTERED, read from the name the app's native code opens: Android's
 * MainActivity `getMainComponentName` (.kt or .java), else iOS's AppDelegate `withModuleName` or
 * `moduleName` (.swift or .mm). The root must be registered under that name, or the app crashes at
 * launch with '"<name>" has not been registered'.
 *
 *     no android/ or ios/ folder  - Expo makes them at build, opening "main": registerRootComponent
 *     native code opening "main"  - an Expo app's own native folders: registerRootComponent
 *     any other name              - AppRegistry under that name, even when the app has Expo modules
 *
 * Whether the app depends on Expo does not decide it: a bare app with Expo modules depends on Expo
 * and opens its own name (proven on device: registerRootComponent crashed it, AppRegistry opened
 * Storybook).
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import { readProjectJson } from '../../../helpers/projectJson';
import type { RootRegistration } from '../../../render/initSteps';

/** The name Expo's `registerRootComponent` registers and Expo's native projects open. */
const EXPO_MAIN_COMPONENT = 'main';

/** Folders of a native project that hold built or installed code, never the app's own. */
const SKIPPED_NATIVE_FOLDERS = new Set(['build', '.gradle', 'Pods', 'node_modules']);

/** `getMainComponentName(): String = "X"` (Kotlin) or `getMainComponentName() { return "X"; }` (Java). */
const ANDROID_NAME = /getMainComponentName\s*\(\s*\)[^"}]*"([^"]+)"/;
/** `withModuleName: "X"` (Swift, React Native 0.79+) or `moduleName = @"X"` (Objective-C, older Swift). */
const IOS_NAME = /(?:withModuleName:\s*|moduleName\s*=\s*)@?"([^"]+)"/;

function rootRegistration(): RootRegistration {
  const appFolder = getCwd();
  const androidFolder = path.join(appFolder, 'android');
  const iosFolder = path.join(appFolder, 'ios');
  const hasAndroid = fs.existsSync(androidFolder);
  const hasIos = fs.existsSync(iosFolder);
  if (!hasAndroid && !hasIos) return { registers: 'main' };

  const nativeName =
    (hasAndroid ? nameInFile(androidFolder, /^MainActivity\.(?:kt|java)$/, ANDROID_NAME) : null) ??
    (hasIos ? nameInFile(iosFolder, /^AppDelegate\.(?:swift|mm)$/, IOS_NAME) : null);
  if (nativeName === EXPO_MAIN_COMPONENT) return { registers: 'main' };

  const appJsonName: unknown = readProjectJson(appFolder, 'app.json')?.name;
  // BUILD DEBT (init-for-agents): native code whose name is not read (a custom MainActivity) is
  // taken to open app.json's name, as React Native's template writes it in both.
  if (nativeName === null) {
    return { registers: 'named', name: String(appJsonName ?? ''), inAppJson: true };
  }
  return { registers: 'named', name: nativeName, inAppJson: appJsonName === nativeName };
}

/** The name `pattern` captures in the first file under `folder` whose name matches `fileName`. */
function nameInFile(folder: string, fileName: RegExp, pattern: RegExp): string | null {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const entryPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_NATIVE_FOLDERS.has(entry.name)) continue;
      const found = nameInFile(entryPath, fileName, pattern);
      if (found !== null) return found;
    } else if (fileName.test(entry.name)) {
      const match = pattern.exec(fs.readFileSync(entryPath, 'utf8'));
      if (match) return match[1];
    }
  }
  return null;
}

export default rootRegistration;
