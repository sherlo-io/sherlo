import { Build } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import { Config } from '../types';
import getAppBuildUrl from './getAppBuildUrl';
import getBuildRunConfig from './getBuildRunConfig';
import getTokenParts from './getTokenParts';
import handleClientError from './handleClientError';
import logBuildIntroMessage from './logBuildIntroMessage';
import logBuildResultsMessage from './logBuildResultsMessage';
import uploadOrLogBinaryReuse from './uploadOrLogBinaryReuse';
import getValidatedBinariesInfo from './getValidatedBinariesInfo';

async function uploadBuildsAndRunTests({
  config,
  gitInfo,
  expoUpdateInfo,
}: {
  config: Config<'withBuildPaths'>;
  gitInfo: Build['gitInfo'];
  expoUpdateInfo?: {
    slug: string;
    androidUrl?: string;
    iosUrl?: string;
  };
}): Promise<{ buildIndex: number; url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(config.token);
  const client = SDKApiClient(apiToken);

  const binariesInfo = await getValidatedBinariesInfo({
    client,
    command: expoUpdateInfo ? 'expo-updates' : 'local-builds',
    config,
    projectIndex,
    teamId,
  });

  logBuildIntroMessage(config);

  await uploadOrLogBinaryReuse(config, binariesInfo);

  const { build } = await client
    .openBuild({
      sdkVersion: binariesInfo.sdkVersion,
      teamId,
      projectIndex,
      binaryHashes: {
        android: binariesInfo.android?.hash,
        ios: binariesInfo.ios?.hash,
      },
      buildRunConfig: getBuildRunConfig({
        config,
        binaryS3Keys: {
          android: binariesInfo.android?.s3Key,
          ios: binariesInfo.ios?.s3Key,
        },
        expoUpdateInfo,
      }),
      gitInfo,
    })
    .catch(handleClientError);

  const buildIndex = build.index;
  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  logBuildResultsMessage(url);

  return { buildIndex, url };
}

export default uploadBuildsAndRunTests;
