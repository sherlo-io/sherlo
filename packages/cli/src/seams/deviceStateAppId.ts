/**
 * THE APP'S ID - what the project's own files name the app on a platform: Expo's app.json first,
 * then the native project. Split from ./deviceState, which finds the phone the id is looked for on.
 */
import fs from 'fs';
import path from 'path';
import { readProjectJson } from '../helpers/projectJson';
import type { SceneDevice } from './deviceState';
import { readIfThere } from './iosConfiguration';

/** The app's id as the project names it: Expo's app.json first, then the native project. */
export function appIdOf(platform: SceneDevice['platform'], root: string): string | undefined {
  const expo = readProjectJson(root, 'app.json')?.expo as
    | { ios?: { bundleIdentifier?: string }; android?: { package?: string } }
    | undefined;
  const fromExpo = platform === 'ios' ? expo?.ios?.bundleIdentifier : expo?.android?.package;
  if (fromExpo) return safeId(fromExpo);

  if (platform === 'ios') {
    const iosFolder = path.join(root, 'ios');
    const projects = fs.existsSync(iosFolder)
      ? fs.readdirSync(iosFolder).filter((name) => name.endsWith('.xcodeproj'))
      : [];
    for (const project of projects) {
      const pbxproj = readIfThere(path.join(iosFolder, project, 'project.pbxproj')) ?? '';
      const ids = [...pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/g)]
        .map((match) => match[1])
        .filter((id) => !id.includes('$') && !/tests$/i.test(id));
      if (ids[0]) return safeId(ids[0]);
    }
    return undefined;
  }

  for (const file of ['build.gradle', 'build.gradle.kts']) {
    const gradle = readIfThere(path.join(root, 'android/app', file)) ?? '';
    const id = /applicationId\s*=?\s*["']([^"']+)["']/.exec(gradle)?.[1];
    if (id) return safeId(id);
  }
  return undefined;
}

/** An id goes into a device shell line, so only an id's own characters are taken. */
function safeId(id: string): string | undefined {
  return /^[A-Za-z0-9._-]+$/.test(id) ? id : undefined;
}
