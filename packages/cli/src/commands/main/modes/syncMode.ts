import { Build } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import { getErrorMessage, getTokenParts } from '../utils';
import { Config } from '../types';
import {
  getAppBuildUrl,
  getBuildRunConfig,
  getBuildUploadUrls,
  getPlatformsToTest,
  uploadMobileBuilds,
} from './utils';

async function syncMode({
  token,
  config,
  gitInfo,
}: {
  token: string;
  config: Config<'withBuildPaths'>;
  gitInfo: Build['gitInfo'];
}): Promise<{ buildIndex: number; url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = SDKApiClient(apiToken);

  const platformsToTest = getPlatformsToTest(config);

  const buildUploadUrls = await getBuildUploadUrls(client, {
    platforms: platformsToTest,
    projectIndex,
    teamId,
  });

  await uploadMobileBuilds(
    {
      android: platformsToTest.includes('android') ? config.android : undefined,
      ios: platformsToTest.includes('ios') ? config.ios : undefined,
    },
    buildUploadUrls
  );

  const { build } = await client
    .openBuild({
      teamId,
      projectIndex,
      gitInfo,
      buildRunConfig: getBuildRunConfig({
        config,
        buildPresignedUploadUrls: buildUploadUrls,
      }),
    })
    .catch((error) => {
      throw new Error(getErrorMessage({ type: 'unexpected', message: error.message }));
    });

  const buildIndex = build.index;
  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  console.log(`View your test results at: ${url}\n`);

  return { buildIndex, url };
}

export default syncMode;
