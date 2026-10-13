/**
 * THE SERVICE REFUSED THE SAVED LOGIN (sherlo / Logging in from the terminal, "When does a login
 * stop working?").
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
  throwError({ type: 'auth', message: REJECTED_LOGIN_MESSAGE });
}

export default refuseRejectedLogin;
