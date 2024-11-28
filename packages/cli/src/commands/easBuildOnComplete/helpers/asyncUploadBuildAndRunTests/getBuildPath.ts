import { Platform } from '@sherlo/api-types';
import fs from 'fs';
import path from 'path';
import { throwError } from '../../../../helpers';

function getBuildPath({
  easBuildProfile,
  platform,
}: {
  easBuildProfile: string;
  platform: Platform;
}) {
  let platformPath: string;

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
      message: `Unsupported platform: ${platform}`,
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
  const easJsonData = JSON.parse(fs.readFileSync('eas.json', 'utf8'));

  return easJsonData?.builds?.[platform]?.[easBuildProfile]?.applicationArchivePath ?? null;
}

function findDefaultIosAppPath() {
  const IOS_BUILD_PATH = 'ios/build/Build/Products/Release-iphonesimulator';
  const fileNames = fs.readdirSync(IOS_BUILD_PATH);

  for (let i = 0; i < fileNames.length; i++) {
    const fileName = fileNames[i];

    if (fileName.endsWith('.app')) {
      return path.join(IOS_BUILD_PATH, fileName);
    }
  }

  return '';
}
