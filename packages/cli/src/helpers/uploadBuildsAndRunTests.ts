import { Build } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import { DOCS_LINK } from '../constants';
import { Config } from '../types';
import getAppBuildUrl from './getAppBuildUrl';
import getBuildRunConfig from './getBuildRunConfig';
import getBuildUploadUrls from './getBuildUploadUrls';
import getPlatformsToTest from './getPlatformsToTest';
import getTokenParts from './getTokenParts';
import handleClientError from './handleClientError';
import uploadMobileBuilds from './uploadMobileBuilds';
import getLogLink from './getLogLink';
import throwConfigError from './throwConfigError';

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

  const platformsToTest = getPlatformsToTest(config);

  validatePlatforms(platformsToTest, config);

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
        expoUpdateInfo,
      }),
    })
    .catch(handleClientError);

  const buildIndex = build.index;
  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  console.log(`Test results: ${getLogLink(url)}\n`);

  return { buildIndex, url };
}

function validatePlatforms(platformsToTest: string[], config: Config<'withBuildPaths'>): void {
  if (platformsToTest.includes('android') && !config.android) {
    throwConfigError(
      '`android` path is not provided, despite at least one Android testing device being defined',
      DOCS_LINK.configAndroid
    );
  }

  if (platformsToTest.includes('ios') && !config.ios) {
    throwConfigError(
      '`ios` path is not provided, despite at least one iOS testing device being defined',
      DOCS_LINK.configIos
    );
  }
}

export default uploadBuildsAndRunTests;