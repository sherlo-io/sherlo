import { Platform } from '@sherlo/api-types';
import fs from 'fs';
import path, { join } from 'path';
import { getCwd, getErrorWithCustomMessage, throwError } from '../../../../helpers';

function getBuildPath({
  easBuildProfile,
  platform,
}: {
  easBuildProfile: string;
  platform: Platform;
}) {
  let platformPath: string | null = null;

  if (platform === 'android') {
    /**
     * Android build details: https://docs.expo.dev/build-reference/android-builds/
     */

    const DEFAULT_PATH = 'android/app/build/outputs/apk/release/app-release.apk';

    platformPath =
      getBuildPathFromEasJson({ easBuildProfile, platform: 'android' }) ?? DEFAULT_PATH;
  } else if (platform === 'ios') {
    /**
     * iOS build details: https://docs.expo.dev/build-reference/ios-builds/
     */

    platformPath =
      getBuildPathFromEasJson({ easBuildProfile, platform: 'ios' }) ?? findDefaultIosAppPath();
  } else {
    throwError({
      type: 'unexpected',
      error: new Error(`Unsupported platform: ${platform}`),
    });
  }

  if (!platformPath) {
    throwError({
      type: 'unexpected',
      error: new Error(`Could not find build path for platform: ${platform}`),
    });
  }

  // Relative to the project folder the hook runs in (the project-folder seam), not wherever this
  // process happens to stand - which is the same folder on EAS, and the posed folder in a pose.
  if (!fs.existsSync(path.resolve(getCwd(), platformPath))) {
    throwError({
      type: 'unexpected',
      error: new Error(`Build file does not exist at path: ${platformPath}`),
    });
  }

  return platformPath;
}

export default getBuildPath;

/* ========================================================================== */

function getBuildPathFromEasJson({
  easBuildProfile,
  platform,
}: {
  easBuildProfile: string;
  platform: Platform;
}): string | null {
  const easJsonPath = join(getCwd(), 'eas.json');

  let easJsonData;
  try {
    easJsonData = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
  } catch (error) {
    throwError({
      type: 'unexpected',
      error: getErrorWithCustomMessage(error, `Invalid ${easJsonPath}`),
    });
  }

  // eas.json nests a profile's settings as `build.<profile>.<platform>`: the hook used to read
  // `builds.<platform>.<profile>`, which no eas.json has, so a profile's own archive path was never
  // found and the default path was always used (Sherlo 3 audit).
  return easJsonData?.build?.[easBuildProfile]?.[platform]?.applicationArchivePath ?? null;
}

function findDefaultIosAppPath(): string | null {
  const IOS_BUILD_PATH = 'ios/build/Build/Products/Release-iphonesimulator';

  const buildFolder = path.resolve(getCwd(), IOS_BUILD_PATH);

  if (!fs.existsSync(buildFolder)) {
    return null;
  }

  const fileNames = fs.readdirSync(buildFolder);

  for (let i = 0; i < fileNames.length; i++) {
    const fileName = fileNames[i];

    if (fileName.endsWith('.app')) {
      return path.join(IOS_BUILD_PATH, fileName);
    }
  }

  return null;
}
