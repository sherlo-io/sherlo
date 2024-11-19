import { Platform } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { EXPO_CLOUD_BUILDS_COMMAND } from '../../constants';
import {
  getLogLink,
  getTokenParts,
  handleClientError,
  getAppBuildUrl,
  getValidatedBinariesInfo,
  uploadOrLogBinaryReuse,
  throwError,
} from '../../helpers';

async function asyncUploadPlatformBuild({
  buildIndex,
  sherloBuildProfile,
  token,
}: {
  buildIndex: number;
  sherloBuildProfile: string;
  token: string;
}) {
  console.log('[DEBUG] asyncUploadPlatformBuild CWD:', {
    cwd: process.cwd(),
    dirname: __dirname,
    platform: process.env.EAS_BUILD_PLATFORM,
  });

  const platform = process.env.EAS_BUILD_PLATFORM as Platform;

  const platformPath = getPlatformPath({ platform, sherloBuildProfile });

  const { url } = await asyncUploadMode({
    buildIndex,
    buildPath: platformPath,
    platform,
    token,
  });

  console.log(`Tests start after all builds are uploaded ➜ ${getLogLink(url)}\n`);
}

export default asyncUploadPlatformBuild;

/* ========================================================================== */

function getPlatformPath({
  platform,
  sherloBuildProfile,
}: {
  platform: Platform;
  sherloBuildProfile: string;
}) {
  let platformPath: string;

  if (platform === 'android') {
    /* Android build details: https://docs.expo.dev/build-reference/android-builds/ */

    const DEFAULT_PATH = 'android/app/build/outputs/apk/release/app-release.apk';

    platformPath =
      getPlatformPathFromEasJson({ platform: 'android', sherloBuildProfile }) ?? DEFAULT_PATH;
  } else if (platform === 'ios') {
    /* iOS build details: https://docs.expo.dev/build-reference/ios-builds/ */

    platformPath =
      getPlatformPathFromEasJson({ platform: 'ios', sherloBuildProfile }) ??
      findDefaultIosAppPath();
  } else {
    throwError({
      message: `unsupported platform: ${platform}`,
    });
  }

  console.log('[DEBUG] Platform path resolved:', {
    platform,
    platformPath,
    exists: fs.existsSync(platformPath),
    stats: fs.existsSync(platformPath) ? fs.statSync(platformPath) : null,
  });

  console.log('[DEBUG] getPlatformPath CWD and resolved path:', {
    cwd: process.cwd(),
    dirname: __dirname,
    platformPath,
    absolutePath: path.resolve(platformPath),
  });

  return platformPath;
}

function getPlatformPathFromEasJson({
  platform,
  sherloBuildProfile,
}: {
  platform: Platform;
  sherloBuildProfile: string;
}): string | null {
  console.log('[DEBUG] Attempting to read eas.json:', {
    cwd: process.cwd(),
    exists: fs.existsSync('eas.json'),
    stats: fs.existsSync('eas.json') ? fs.statSync('eas.json') : null,
  });

  try {
    const easJsonData = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
    return easJsonData?.builds?.[platform]?.[sherloBuildProfile]?.applicationArchivePath ?? null;
  } catch (error) {
    console.error('[DEBUG] Error reading eas.json:', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
    return null;
  }
}

function findDefaultIosAppPath() {
  const IOS_BUILD_PATH = 'ios/build/Build/Products/Release-iphonesimulator';

  console.log('[DEBUG] Attempting to read iOS build directory:', {
    path: IOS_BUILD_PATH,
    cwd: process.cwd(),
    exists: fs.existsSync(IOS_BUILD_PATH),
    stats: fs.existsSync(IOS_BUILD_PATH) ? fs.statSync(IOS_BUILD_PATH) : null,
  });

  try {
    const fileNames = fs.readdirSync(IOS_BUILD_PATH);
    console.log('[DEBUG] iOS build directory contents:', fileNames);

    for (let i = 0; i < fileNames.length; i++) {
      const fileName = fileNames[i];

      if (fileName.endsWith('.app')) {
        return path.join(IOS_BUILD_PATH, fileName);
      }
    }

    return '';
  } catch (error) {
    console.error('[DEBUG] Error reading iOS build directory:', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
    return '';
  }
}

async function asyncUploadMode({
  token,
  buildIndex,
  buildPath,
  platform,
}: {
  token: string;
  buildIndex: number;
  buildPath: string;
  platform: Platform;
}): Promise<{ buildIndex: number; url: string }> {
  console.log('[DEBUG] Starting asyncUploadMode:', {
    buildIndex,
    buildPath,
    platform,
    exists: fs.existsSync(buildPath),
    stats: fs.existsSync(buildPath) ? fs.statSync(buildPath) : null,
  });

  console.log('[DEBUG] asyncUploadMode CWD and paths:', {
    cwd: process.cwd(),
    dirname: __dirname,
    buildPath,
    absoluteBuildPath: path.resolve(buildPath),
  });

  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = SDKApiClient(apiToken);

  const binariesInfo = await getValidatedBinariesInfo({
    buildPath,
    client,
    command: EXPO_CLOUD_BUILDS_COMMAND,
    platform,
    projectIndex,
    teamId,
  });

  await uploadOrLogBinaryReuse(
    platform === 'android' ? { android: buildPath } : { ios: buildPath },
    binariesInfo
  );

  await client
    .asyncUpload({
      buildIndex,
      projectIndex,
      teamId,
      androidS3Key: binariesInfo.android?.s3Key,
      iosS3Key: binariesInfo.ios?.s3Key,
      sdkVersion: binariesInfo.sdkVersion,
    })
    .catch(handleClientError);

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  return { buildIndex, url };
}
