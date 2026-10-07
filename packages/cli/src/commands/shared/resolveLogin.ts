/**
 * THE LOGIN A MANAGEMENT COMMAND SPENDS - the one `sherlo login` saved for the service address
 * this run talks to, read through ../../seams/savedLogins (sherlo / Teams, projects and the
 * personal token). It is the only credential these commands take: no flag and no variable carries
 * a personal token.
 *
 * Shared across every management command (`project create`, `project list`, `team create`,
 * `team list`) and setup, so the refusal for a missing login is written once.
 */
import { throwError } from '../../helpers';
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import { savedLogins, type SavedLogin } from '../../seams/savedLogins';
import { LOGIN_COMMAND } from '../login/constants';

function resolveLogin(thisCommand: string): SavedLogin {
  const savedLogin = savedLogins().read(getEndpointUrl());

  if (!savedLogin) {
    throwError({
      type: 'auth',
      message:
        `\`npx sherlo ${thisCommand}\` needs you to be logged in. ` +
        `Run \`npx sherlo ${LOGIN_COMMAND}\`.`,
    });
  }

  return savedLogin;
}

export default resolveLogin;
