/**
 * A team or project call setup made that the service refused or could not answer. Setup spends the
 * saved login alone, so a refused token is a refused login, answered the way every command answers
 * it - log in again (../../shared/refuseRejectedLogin) - and anything else with the service's own
 * words.
 */
import { throwError } from '../../../helpers';
import { CreateProjectAuthError } from '../../projectCreate/createProjectRequest';
import { ListProjectsAuthError } from '../../projectList/listProjectsRequest';
import { refuseRejectedLogin } from '../../shared';
import { CreateTeamAuthError } from '../../teamCreate/createTeamRequest';
import { ListTeamsAuthError } from '../../teamList/listTeamsRequest';

function refuseFailedServiceCall(error: Error): never {
  const serviceRefusedTheLogin =
    error instanceof ListTeamsAuthError ||
    error instanceof ListProjectsAuthError ||
    error instanceof CreateTeamAuthError ||
    error instanceof CreateProjectAuthError;

  if (serviceRefusedTheLogin) refuseRejectedLogin();

  throwError({ message: error.message, errorToReport: error });
}

export default refuseFailedServiceCall;
