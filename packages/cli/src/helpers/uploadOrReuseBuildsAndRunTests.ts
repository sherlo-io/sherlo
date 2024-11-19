import { Build } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import { Config } from '../types';
import getAppBuildUrl from './getAppBuildUrl';
import getBuildRunConfig from './getBuildRunConfig';
import getTokenParts from './getTokenParts';
import getValidatedBinariesInfoAndNextBuildIndex from './getValidatedBinariesInfoAndNextBuildIndex';
import handleClientError from './handleClientError';
import logBuildIntroMessage from './logBuildIntroMessage';
import logBuildResultsMessage from './logBuildResultsMessage';
import uploadOrLogBinaryReuse from './uploadOrLogBinaryReuse';

async function uploadOrReuseBuildsAndRunTests({
  config,
  gitInfo,
  expoUpdateInfo,
}: {
  config: Config<'withBuildPaths'>;
  gitInfo: Build['gitInfo'];
  expoUpdateInfo?: {
    slug: string;
    platformUpdateUrls: { android?: string; ios?: string };
  };
}): Promise<{ buildIndex: number; url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(config.token);
  const client = SDKApiClient(apiToken);

  const { binariesInfo, nextBuildIndex } = await getValidatedBinariesInfoAndNextBuildIndex({
    client,
    command: expoUpdateInfo ? 'expo-updates' : 'local-builds',
    config,
    projectIndex,
    teamId,
  });

  // TODO: zwracany nextBuildIndex jest nieprawidlowy -> rzucilo mi 91, a powinno byc 93 (widac ze na liscie projektow pokazuje 91 buildow, a jak sie wejdzie to widac ze aktualnie jest testowany 93.)
  logBuildIntroMessage({ config, nextBuildIndex });

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

export default uploadOrReuseBuildsAndRunTests;
