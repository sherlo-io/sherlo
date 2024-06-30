import SDKApiClient from '@sherlo/sdk-client';
import { getTokenParts } from '../utils';
import { handleClientError, getAppBuildUrl } from './utils';

async function closeBuildMode({
  token,
  closeBuildIndex,
}: {
  token: string;
  closeBuildIndex: number;
}): Promise<{ buildIndex: number; url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = SDKApiClient(apiToken);

  await client
    .closeBuild({
      buildIndex: closeBuildIndex,
      projectIndex,
      teamId,
      runError: 'user_expoBuildError',
    })
    .catch(handleClientError);

  const url = getAppBuildUrl({ buildIndex: closeBuildIndex, projectIndex, teamId });
  return { buildIndex: closeBuildIndex, url };
}

export default closeBuildMode;
