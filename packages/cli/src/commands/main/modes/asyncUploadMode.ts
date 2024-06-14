import { Platform } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import { getTokenParts } from '../utils';
import { getAppBuildUrl, getBuildUploadUrls, uploadMobileBuilds, handleClientError } from './utils';

async function asyncUploadMode({
  token,
  asyncBuildIndex,
  path,
  platform,
}: {
  token: string;
  asyncBuildIndex: number;
  path: string;
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
    platform === 'android' ? { android: path } : { ios: path },
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

export default asyncUploadMode;
