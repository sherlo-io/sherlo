import { GITHUB_ID_TOKEN_AUDIENCE } from '../../../constants';
import { renderNoGitHubIdToken } from '../../../render/pushCredential';
import throwError from '../../throwError';

/** The one kind of GET this makes, the way `fetch` answers it. */
type FetchUrl = (
  url: string,
  init: { headers: { Authorization: string } }
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Asks GitHub for the ID token of the job that is running, for the audience the Sherlo service
 * checks. A refusal and an answer with no token both end in the same refusal: add the
 * `permissions: id-token: write` the job lacks, or set SHERLO_TOKEN.
 *
 * It reads no environment: the caller hands over the request address and request token GitHub gave
 * the job, and has already refused a job that was given none. The network is reached only from
 * src/seams, so the caller there hands over its `fetch` too.
 */
async function requestGitHubIdToken({
  fetchUrl,
  requestUrl,
  requestToken,
}: {
  fetchUrl: FetchUrl;
  requestUrl: string;
  requestToken: string;
}): Promise<string> {
  const response = await fetchUrl(`${requestUrl}&audience=${GITHUB_ID_TOKEN_AUDIENCE}`, {
    headers: { Authorization: `bearer ${requestToken}` },
  });

  const body = response.ok ? ((await response.json()) as { value?: unknown }) : undefined;

  if (typeof body?.value !== 'string' || !body.value) throwError(renderNoGitHubIdToken());

  return body.value;
}

export default requestGitHubIdToken;
