/**
 * A team or project call setup made that the service refused or could not answer. A refused saved
 * login is answered the way every command answers it - log in again (../../shared/refuseRejectedLogin)
 * - and anything else with the service's own words.
 */
import { throwError } from '../../../helpers';
import { CreateProjectAuthError } from '../../projectCreate/createProjectRequest';
import { ListProjectsAuthError } from '../../projectList/listProjectsRequest';
import { refuseRejectedLogin } from '../../shared';
import { CreateTeamAuthError } from '../../teamCreate/createTeamRequest';
import { ListTeamsAuthError } from '../../teamList/listTeamsRequest';

function refuseFailedServiceCall(
  error: Error,
  { fromSavedLogin }: { fromSavedLogin: boolean }
): never {
  const serviceRefusedTheToken =
    error instanceof ListTeamsAuthError ||
    error instanceof ListProjectsAuthError ||
    error instanceof CreateTeamAuthError ||
    error instanceof CreateProjectAuthError;

  if (serviceRefusedTheToken && fromSavedLogin) refuseRejectedLogin();

  throwError({ message: error.message, errorToReport: error });
}

export default refuseFailedServiceCall;
