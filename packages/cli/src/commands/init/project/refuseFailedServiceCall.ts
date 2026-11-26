/**
 * A team or project call setup made that the service refused or could not answer. Setup spends the
 * saved login alone, so a refused token is a refused login, answered the way every command answers
 * it - log in again (../../shared/refuseRejectedLogin) - and anything else with the service's own
 * words, then to try again in a few minutes.
 */
import { throwError } from '../../../helpers';
import {
  renderLoginRejected,
  renderServiceFailed,
  renderServiceUnreachable,
} from '../../../render/initFixes';
import { renderFailedStepLine } from '../../../render/initSteps';
import { printLines } from '../helpers';
import { CreateProjectAuthError } from '../../projectCreate/createProjectRequest';
import { ListProjectsAuthError } from '../../projectList/listProjectsRequest';
import { CreateTeamAuthError } from '../../teamCreate/createTeamRequest';
import { ListTeamsAuthError } from '../../teamList/listTeamsRequest';

/** Whether the service answered a team or project call by refusing the login it was made with. */
export function isRefusedLogin(error: unknown): boolean {
  return (
    error instanceof ListTeamsAuthError ||
    error instanceof ListProjectsAuthError ||
    error instanceof CreateTeamAuthError ||
    error instanceof CreateProjectAuthError
  );
}

/** `failedStep` names the step that stopped, e.g. "Choosing a team failed". */
function refuseFailedServiceCall(error: Error, failedStep: string): never {
  // LIKE EVERY STOP, the step that stopped is marked red above the error, whatever the error.
  printLines(renderFailedStepLine(failedStep));

  if (isRefusedLogin(error)) {
    throwError({ ...renderLoginRejected(), errorToReport: error });
  }

  // A call that never reached the service carries the network's own code (ENOTFOUND, ECONNREFUSED)
  // on its cause: the fix is the connection, said with that code, not a bug report.
  const { cause } = error as { cause?: { code?: string; hostname?: string } };
  if (cause?.code) {
    throwError({
      ...renderServiceUnreachable({ host: cause.hostname, code: cause.code }),
      errorToReport: error,
    });
  }

  throwError({ ...renderServiceFailed({ reason: error.message }), errorToReport: error });
}

export default refuseFailedServiceCall;
