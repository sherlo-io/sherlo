import { Platform } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import { DEFAULT_PROJECT_ROOT, PLATFORM_LABEL } from '../../../../constants';
import {
  getAppBuildUrl,
  getTokenParts,
  getValidatedBinariesInfoAndNextBuildIndex,
  handleClientError,
  printResultsUrl,
  uploadOrPrintBinaryReuse,
} from '../../../../helpers';
import { THIS_COMMAND } from '../../constants';
import getBuildPath from './getBuildPath';

async function asyncUploadBuildAndRunTests({
  buildIndex,
  easBuildProfile,
  token,
}: {
  buildIndex: number;
  easBuildProfile: string;
  token: string;
}) {
  const platform = process.env.EAS_BUILD_PLATFORM as Platform;

  const buildPath = getBuildPath({ easBuildProfile, platform });

  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = sdkClient({ authToken: apiToken });

  const { binariesInfo } = await getValidatedBinariesInfoAndNextBuildIndex({
    buildPath,
    client,
    command: THIS_COMMAND,
    platform,
    projectIndex,
    teamId,
  });

  await uploadOrPrintBinaryReuse({
    binariesInfo,
    projectRoot: DEFAULT_PROJECT_ROOT,
    android: platform === 'android' ? buildPath : undefined,
    ios: platform === 'ios' ? buildPath : undefined,
  });

  const { couldRunThisBuildRightNow } = await client
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

  if (!couldRunThisBuildRightNow) {
    console.log(
      `⏳ Waiting for ${
        platform === 'android' ? PLATFORM_LABEL.ios : PLATFORM_LABEL.android
      } build to complete...\n`
    );
  } else {
    console.log('🚀 All required platforms are ready - starting tests...\n');

    printResultsUrl(url);
  }

  return { buildIndex, url };
}

export default asyncUploadBuildAndRunTests;
