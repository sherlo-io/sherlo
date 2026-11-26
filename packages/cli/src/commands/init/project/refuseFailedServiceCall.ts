/**
 * A team or project call setup made that the service refused or could not answer. A refusal of a
 * login the service no longer takes is answered the way every command answers it - log in again
 * (../../shared/refuseRejectedLogin) - and anything else with the service's own words, then to try
 * again in a few minutes when the failure passes with time.
 *
 * A REFUSAL ALONE DOES NOT SAY WHOSE IT IS: the service's authorizer answers a dead login and a team
 * the person can't reach with the same "Unauthorized" (sherlo-api _personalTokenAuthorizer). The
 * one call that names no team - the team list - tells them apart ({@link whyRefused}).
 */
import { throwError } from '../../../helpers';
import { getEndpointUrl } from '../../../helpers/buildStatusRequest';
import {
  renderLoginRejected,
  renderServiceFailed,
  renderServiceUnreachable,
} from '../../../render/initFixes';
import { renderFailedStepLine } from '../../../render/initSteps';
import { serverCalls } from '../../../seams/serverCalls';
import { printLines } from '../helpers';
import { CreateProjectAuthError } from '../../projectCreate/createProjectRequest';
import { ListProjectsAuthError } from '../../projectList/listProjectsRequest';
import { CreateTeamAuthError } from '../../teamCreate/createTeamRequest';
import { ListTeamsAuthError } from '../../teamList/listTeamsRequest';

/**
 * Whose refusal a failed call was: the login's (`dead-login`), or the team's or project's while the
 * login still works (`no-access`). Null for a failure that is no refusal, or one the team list could
 * not judge because it failed some other way - then the service's own words stand.
 *
 * The team list's own refusal is the login's without asking again: it names no team.
 */
export async function whyRefused(
  error: unknown,
  personalToken: string
): Promise<'dead-login' | 'no-access' | null> {
  if (error instanceof ListTeamsAuthError) return 'dead-login';
  if (!isRefusedCall(error)) return null;

  return serverCalls()
    .listTeams({ personalToken })
    .then(
      () => 'no-access' as const,
      (teamListError: unknown) =>
        teamListError instanceof ListTeamsAuthError ? 'dead-login' : null
    );
}

/**
 * `failedStep` names the step that stopped, e.g. "Choosing a team failed". `personalToken` is the
 * login the call spent; null for a call that spent none - the browser login's own calls, made before
 * there is a login - and for one whose refusal the caller already told apart.
 */
async function refuseFailedServiceCall(
  error: Error,
  failedStep: string,
  personalToken: string | null
): Promise<never> {
  // Asked BEFORE the red line: the question is a call of its own, and the line comes last.
  const refusal = personalToken === null ? null : await whyRefused(error, personalToken);

  // LIKE EVERY STOP, the step that stopped is marked red above the error, whatever the error.
  printLines(renderFailedStepLine(failedStep));

  if (refusal === 'dead-login') {
    throwError({ ...renderLoginRejected(), errorToReport: error });
  }

  // A call that never reached the service carries the network's own code (ENOTFOUND, ECONNREFUSED):
  // the fix is the connection, said with that code, not a bug report.
  const networkCode = networkErrorCode(error);
  if (networkCode) {
    throwError({
      // node-fetch names no host, so the host is the address every call goes to.
      ...renderServiceUnreachable({ host: new URL(getEndpointUrl()).hostname, code: networkCode }),
      errorToReport: error,
    });
  }

  // BUILD DEBT (init-for-agents): a `no-access` refusal of a team the person picked from their own
  // list (their role there changed in between) says the service's words; only a project a config
  // names has its own screen (../steps/teamAndProject showProjectInConfig).
  return throwError({
    ...renderServiceFailed({ reason: error.message, passing: isPassingFailure(error) }),
    errorToReport: error,
  });
}

/* ========================================================================== */

/** Whether the service answered a team or project call by refusing it, for whichever reason. */
function isRefusedCall(error: unknown): boolean {
  return (
    error instanceof ListProjectsAuthError ||
    error instanceof CreateTeamAuthError ||
    error instanceof CreateProjectAuthError
  );
}

/**
 * Whether the failure passes with time: a 5xx or a timeout. The team and project calls raise a
 * status the service answered as `HTTP <status>: <text>` (listTeamsRequest, listProjectsRequest,
 * createTeamRequest, createProjectRequest), the Sherlo client under Apollo as `statusCode` on
 * `networkError`, and node-fetch its timeout as type `request-timeout`. A GraphQL error is the
 * service's answer to this request (sherlo-api's resolvers throw it as `<call>:<reason>`, such as
 * `createProject:tooLongName`), so the same request gets it again.
 */
function isPassingFailure(error: Error): boolean {
  if (/^HTTP 5\d\d\b/.test(error.message)) return true;
  const raised = [error, (error as { networkError?: unknown }).networkError];
  return raised.some((candidate) => {
    const { type, statusCode } = (candidate ?? {}) as { type?: unknown; statusCode?: unknown };
    return type === 'request-timeout' || (typeof statusCode === 'number' && statusCode >= 500);
  });
}

/**
 * The network's own code when the call never reached the service. Both ways setup calls the service
 * fetch through node-fetch 2: the team and project calls directly, the Sherlo client through
 * isomorphic-fetch under Apollo, which keeps the fetch's error on `networkError`. node-fetch marks
 * an error of the system under it (DNS, refused connection, reset) as `type: 'system'` with that
 * code on `code` (node-fetch 2 lib/index.js, FetchError).
 */
function networkErrorCode(error: Error): string | undefined {
  const raised = [error, (error as { networkError?: unknown }).networkError];
  for (const candidate of raised) {
    const { type, code } = (candidate ?? {}) as { type?: unknown; code?: unknown };
    if (type === 'system' && typeof code === 'string') return code;
  }
  return undefined;
}

export default refuseFailedServiceCall;
