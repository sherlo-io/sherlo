import { Platform } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import fs from 'fs';
import path from 'path';
import process from 'process';
import {
  getLogLink,
  getTokenParts,
  handleClientError,
  getAppBuildUrl,
  getBuildUploadUrls,
  uploadMobileBuilds,
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
  const platform = process.env.EAS_BUILD_PLATFORM as Platform;

  let platformPath = '';
  if (platform === 'android') {
    // Android build details: https://docs.expo.dev/build-reference/android-builds/

    const defaultPath = 'android/app/build/outputs/apk/release/app-release.apk';

    platformPath =
      getPlatformPathFromEasJson({ platform: 'android', sherloBuildProfile }) ?? defaultPath;
  } else if (platform === 'ios') {
    // iOS build details: https://docs.expo.dev/build-reference/ios-builds/

    platformPath =
      getPlatformPathFromEasJson({ platform: 'ios', sherloBuildProfile }) ??
      findDefaultIosAppPath();
  }

  const { url } = await asyncUploadMode({
    asyncBuildIndex: buildIndex,
    buildPath: platformPath,
    platform,
    token,
  });

  console.log(`Tests start after all builds are uploaded ➜ ${getLogLink(url)}\n`);
}

export default asyncUploadPlatformBuild;

/* ========================================================================== */

function getPlatformPathFromEasJson({
  platform,
  sherloBuildProfile,
}: {
  platform: Platform;
  sherloBuildProfile: string;
}): string | null {
  const easJsonData = JSON.parse(fs.readFileSync('eas.json', 'utf8'));

  return easJsonData?.builds?.[platform]?.[sherloBuildProfile]?.applicationArchivePath ?? null;
}

function findDefaultIosAppPath() {
  const iosBuildPath = 'ios/build/Build/Products/Release-iphonesimulator';
  const fileNames = fs.readdirSync(iosBuildPath);

  for (let i = 0; i < fileNames.length; i++) {
    const fileName = fileNames[i];

    if (fileName.endsWith('.app')) {
      return path.join(iosBuildPath, fileName);
    }
  }

  return '';
}

async function asyncUploadMode({
  token,
  asyncBuildIndex,
  buildPath,
  platform,
}: {
  token: string;
  asyncBuildIndex: number;
  buildPath: string;
  platform: Platform;
}): Promise<{ buildIndex: number; url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = SDKApiClient(apiToken);

  const buildUploadUrls = await getBuildUploadUrls(client, {
    platforms: platform === 'android' ? ['android'] : ['ios'],
    projectIndex,
    teamId,
  });

  await uploadMobileBuilds(
    platform === 'android' ? { android: buildPath } : { ios: buildPath },
    buildUploadUrls
  );

  const buildIndex = asyncBuildIndex;
  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  await client
    .asyncUpload({
      buildIndex,
      projectIndex,
      teamId,
      androidS3Key: buildUploadUrls.android?.s3Key,
      iosS3Key: buildUploadUrls.ios?.s3Key,
    })
    .catch(handleClientError);

  return { buildIndex, url };
}
