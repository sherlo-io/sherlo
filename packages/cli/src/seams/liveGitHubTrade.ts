import type sdkClient from '@sherlo/sdk-client';
import requestGitHubIdToken from '../helpers/getValidatedCommandParams/validateCommandParams/requestGitHubIdToken';
import type { GitHubIdTokenTrade } from './serverCalls';

/**
 * The live sign-in through GitHub: asks GitHub for the job's ID token, trades it with the service,
 * and answers in the CLI's own words. The ID token is asked for here and not by the caller, so a
 * posed run, which never reaches this, never reaches GitHub either.
 */
async function liveGitHubTrade(
  client: Pick<ReturnType<typeof sdkClient>, 'tradeGithubIdToken'>,
  { repository, teamId }: { repository: string; teamId: string }
): Promise<GitHubIdTokenTrade> {
  const idToken = await requestGitHubIdToken({
    fetchUrl: fetch,
    requestUrl: process.env.ACTIONS_ID_TOKEN_REQUEST_URL ?? '',
    requestToken: process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ?? '',
  });
  const trade = await client.tradeGithubIdToken({ idToken, repository, teamId });

  if (trade.status === 'SIGNED_IN' && trade.token) {
    return { status: 'signed-in', token: trade.token };
  }

  if (trade.status === 'NOT_CONNECTED' && trade.teamName) {
    return { status: 'not-connected', teamName: trade.teamName };
  }

  throw new Error('Sherlo answered the sign-in through GitHub with neither a session nor a team.');
}

export default liveGitHubTrade;
