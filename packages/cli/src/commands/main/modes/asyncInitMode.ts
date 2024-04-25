import { Build } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import { getErrorMessage, getTokenParts } from '../utils';
import { Config } from '../types';
import { createExpoSherloTempFile, getAppBuildUrl, getBuildRunConfig } from './utils';

async function asyncInitMode({
  token,
  config,
  gitInfo,
  projectRoot,
}: {
  token: string;
  config: Config<'withoutPaths'>;
  gitInfo: Build['gitInfo'];
  projectRoot: string;
}): Promise<{ buildIndex: number; url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = SDKApiClient(apiToken);

  const { build } = await client
    .openBuild({
      teamId,
      projectIndex,
      gitInfo: gitInfo,
      asyncUpload: true,
      buildRunConfig: getBuildRunConfig({ config }),
    })
    .catch((error) => {
      throw new Error(getErrorMessage({ type: 'unexpected', message: error.message }));
    });

  const buildIndex = build.index;
  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  createExpoSherloTempFile({ projectRoot, buildIndex, url });

  console.log(
    `Sherlo is awaiting your builds to be uploaded asynchronously.\nBuild index is ${buildIndex}.\n`
  );

  return { buildIndex, url };
}

export default asyncInitMode;
