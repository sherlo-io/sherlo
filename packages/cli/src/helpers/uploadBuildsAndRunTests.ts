import { Build } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import chalk from 'chalk';
import { Config } from '../types';
import countDevicesByPlatform from './countDevicesByPlatform';
import getAppBuildUrl from './getAppBuildUrl';
import getBuildRunConfig from './getBuildRunConfig';
import getLogLink from './getLogLink';
import getTokenParts from './getTokenParts';
import handleClientError from './handleClientError';
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
    config,
    isExpoUpdate: !!expoUpdateInfo,
    projectIndex,
    teamId,
  });

  introMessage(config);

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

  console.log(`Results: ${getLogLink(url)}\n`);

  return { buildIndex, url };
}

export default uploadBuildsAndRunTests;

/* ========================================================================== */

function introMessage(config: Config) {
  const platformCounts = countDevicesByPlatform(config.devices);

  const platformCountsMessage = [];
  let lastCount = 0;

  if (platformCounts.android) {
    platformCountsMessage.push(`${chalk.blue(`${platformCounts.android} Android`)}`);
    lastCount = platformCounts.android;
  }

  if (platformCounts.ios) {
    platformCountsMessage.push(`${chalk.blue(`${platformCounts.ios} iOS`)}`);
    lastCount = platformCounts.ios;
  }

  if (platformCountsMessage.length > 0) {
    const deviceText = lastCount === 1 ? 'device' : 'devices';
    console.log(
      `${chalk.green('Build 42069')} tests will run on ${platformCountsMessage.join(' and ')} ${deviceText}\n`
    );
  }
}
