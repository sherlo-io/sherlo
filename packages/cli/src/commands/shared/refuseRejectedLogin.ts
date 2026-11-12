/**
 * THE SERVICE REFUSED THE SAVED LOGIN.
 *
 * A login stops working when it goes 90 days unused, is revoked, or its owner leaves the team. The
 * service does not say which, and none of them is the person's typing, so the answer is the same
 * for all three: log in again. The management commands and setup spend the login alone, so they
 * always answer a refusal this way; a push calls it only when it spent the login rather than a
 * project token.
 *
 * The words are exported on their own for the one place that cannot throw them: the `--wait` loop
 * (../../helpers/waitForBuildResult), which ends a refused credential with its own exit code.
 */
import throwError from '../../helpers/throwError';
import { LOGIN_COMMAND } from '../login/constants';

export const REJECTED_LOGIN_MESSAGE =
  'Sherlo no longer accepts the login saved on this computer.\n' +
  '  It expired after 90 days unused, was revoked, or its owner left the team.\n' +
  `  Run \`npx sherlo ${LOGIN_COMMAND}\` to log in again.`;

function refuseRejectedLogin(): never {
  throwError({ message: REJECTED_LOGIN_MESSAGE });
}

/**
 * The authorizer refuses a wrong project as it refuses a dead login: both are a 401. When the
 * saved login still lists its teams, it is the project that is wrong, and logging in again would
 * change nothing.
 */
export function refuseWrongProject(): never {
  throwError({
    message:
      'This project is not in your teams.\n' +
      '  Your login is still good, but it cannot reach the project the config names.\n' +
      '  Check the "project" in sherlo.config.json.',
  });
}

export default refuseRejectedLogin;
