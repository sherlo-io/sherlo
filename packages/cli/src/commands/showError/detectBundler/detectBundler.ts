import * as fs from 'fs';
import * as path from 'path';
import { ProjectType } from '../types';
import parseAndroidBundleCommand from './parseAndroidBundleCommand';
import parseIosBundleCommand from './parseIosBundleCommand';

function detectBundler(projectRoot: string): ProjectType {
  const iosExists = fs.existsSync(path.join(projectRoot, 'ios'));
  const androidExists = fs.existsSync(path.join(projectRoot, 'android'));

  if (iosExists || androidExists) {
    const ios = iosExists ? parseIosBundleCommand(projectRoot) : null;
    const android = androidExists ? parseAndroidBundleCommand(projectRoot) : null;
    if (ios !== null && android !== null && ios !== android) {
      throw new Error(
        `iOS and Android bundle commands disagree: iOS='${ios}', Android='${android}'. ` +
        `Check ios/*.xcodeproj/project.pbxproj and android/app/build.gradle.`
      );
    }
    const result = ios ?? android;
    if (result !== null) return result;
  }

  // Managed Expo / CNG: no native dirs (or dirs yielded no signal)
  let pkg: Record<string, any> = {};
  try { pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')); } catch { /* ignore */ }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const hasExpoDep = 'expo' in deps;
  const hasExpoConfig =
    fs.existsSync(path.join(projectRoot, 'app.config.js')) ||
    fs.existsSync(path.join(projectRoot, 'app.config.ts')) ||
    (() => {
      const appJsonPath = path.join(projectRoot, 'app.json');
      if (!fs.existsSync(appJsonPath)) return false;
      try { return 'expo' in JSON.parse(fs.readFileSync(appJsonPath, 'utf8')); } catch { return false; }
    })();

  if (hasExpoDep && hasExpoConfig) return 'expo';

  throw new Error(
    'Cannot determine bundler: no conclusive signal in native build scripts and project does not look like a managed Expo app. ' +
    'Run expo prebuild first or invoke sherlo show-error from a project root with ios/ or android/ directories.'
  );
}

export default detectBundler;
