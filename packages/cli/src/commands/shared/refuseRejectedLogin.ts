/**
 * THE SERVICE REFUSED THE SAVED LOGIN (sherlo / Logging in from the terminal, "When does a login
 * stop working?").
 *
 * A login stops working when it goes 90 days unused, is revoked, or its owner leaves the team. The
 * service does not say which, and none of them is the person's typing, so the answer is the same
 * for all three: log in again. A command calls this in place of its own refusal only when the
 * refused token came from the saved login - a token somebody gave on purpose gets that command's
 * own refusal.
 */
import { throwError } from '../../helpers';
import { LOGIN_COMMAND } from '../login/constants';

function refuseRejectedLogin(): never {
  throwError({
    type: 'auth',
    message:
      'Sherlo no longer accepts the login saved on this computer.\n' +
      '  It expired after 90 days unused, was revoked, or its owner left the team.\n' +
      `  Run \`sherlo ${LOGIN_COMMAND}\` to log in again.`,
  });
}

export default refuseRejectedLogin;
