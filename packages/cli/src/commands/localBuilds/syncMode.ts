import { Build } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import { DOCS_LINK } from '../../constants';
import {
  getLogLink,
  getTokenParts,
  handleClientError,
  throwConfigError,
  getAppBuildUrl,
  getBuildRunConfig,
  getBuildUploadUrls,
  getPlatformsToTest,
  uploadMobileBuilds,
} from '../../helpers';
import { Config } from '../../types';

async function syncMode({
  // token,
  config,
  gitInfo,
}: {
  // token: string;
  config: Config<'withBuildPaths'>;
  gitInfo: Build['gitInfo'];
}): Promise<{ buildIndex: number; url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(config.token);
  const client = SDKApiClient(apiToken);

  const platformsToTest = getPlatformsToTest(config);

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
    .catch(handleClientError);

  const buildIndex = build.index;
  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  console.log(`Test results: ${getLogLink(url)}\n`);

  // TODO: potrzebujemy to zwrocic?
  return { buildIndex, url };
}

export default syncMode;
