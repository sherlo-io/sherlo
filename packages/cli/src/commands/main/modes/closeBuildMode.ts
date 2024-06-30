import SDKApiClient from '@sherlo/sdk-client';
import { getTokenParts } from '../utils';
import { handleClientError, getAppBuildUrl } from './utils';

async function cancelBuildMode({
  token,
  cancelBuildIndex,
}: {
  token: string;
  cancelBuildIndex: number;
}): Promise<{ buildIndex: number; url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = SDKApiClient(apiToken);

  await client
    .cancelBuild({
      buildIndex: cancelBuildIndex,
      projectIndex,
      teamId,
      runError: 'user_expoBuildError',
    })
    .catch(handleClientError);

  const url = getAppBuildUrl({ buildIndex: cancelBuildIndex, projectIndex, teamId });
  return { buildIndex: cancelBuildIndex, url };
}

export default cancelBuildMode;
