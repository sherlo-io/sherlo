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

  if (!fs.existsSync(platformPath)) {
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
  console.log('[DEBUG JSON] Reading eas.json file');
  try {
    const fileContent = fs.readFileSync('eas.json', 'utf8');
    console.log(`[DEBUG JSON] eas.json content (preview): ${fileContent.substring(0, 50)}...`);

    try {
      const easJsonData = JSON.parse(fileContent);
      console.log('[DEBUG JSON] Successfully parsed eas.json');

      return easJsonData?.builds?.[platform]?.[easBuildProfile]?.applicationArchivePath ?? null;
    } catch (parseError) {
      console.error(`[DEBUG JSON] Error parsing eas.json: ${parseError.message}`);
      throw parseError;
    }
  } catch (readError) {
    console.error(`[DEBUG JSON] Error reading eas.json: ${readError.message}`);
    throw readError;
  }
}

function findDefaultIosAppPath(): string | null {
  const IOS_BUILD_PATH = 'ios/build/Build/Products/Release-iphonesimulator';

  if (!fs.existsSync(IOS_BUILD_PATH)) {
    return null;
  }

  const fileNames = fs.readdirSync(IOS_BUILD_PATH);

  for (let i = 0; i < fileNames.length; i++) {
    const fileName = fileNames[i];

    if (fileName.endsWith('.app')) {
      return path.join(IOS_BUILD_PATH, fileName);
    }
  }

  return null;
}
