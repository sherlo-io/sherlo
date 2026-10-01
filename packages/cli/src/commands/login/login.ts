/**
 * `sherlo login` - sign this terminal in to Sherlo through the browser, once (sherlo / Logging in
 * from the terminal).
 *
 *   1. A saved login the service still accepts ends here: "Already logged in", exit 0.
 *   2. Otherwise it starts a pending login, prints the authorize link on its own line, and opens
 *      the browser on it.
 *   3. It asks the service about every two seconds until the person answers.
 *   4. Authorize: the login is saved and the person's email printed, exit 0. Cancel, or nobody in
 *      ten minutes: it says which, exit 1.
 *
 * EVERYTHING THIS COMMAND TOUCHES IS A SEAM - the service (../../seams/serverCalls), the browser
 * (../../seams/browser) and the saved-login file (../../seams/savedLogins) - so a pose draws every
 * screen it prints. The token the service hands over is saved and never printed.
 */
import { printSherloIntro, throwError } from '../../helpers';
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import { emit } from '../../helpers/transcriptSink';
import { browser } from '../../seams/browser';
import { savedLogins } from '../../seams/savedLogins';
import { serverCalls, type CliLoginAnswer, type PendingCliLogin } from '../../seams/serverCalls';
import { surroundings } from '../../seams/surroundings';
import { LOGIN_COMMAND } from './constants';

/** How long the wait pauses between two questions to the service. */
const POLL_INTERVAL_MS = 2000;

async function login(): Promise<void> {
  printSherloIntro();

  const serviceAddress = getEndpointUrl();

  const savedLogin = savedLogins().read(serviceAddress);
  if (savedLogin && (await serviceAcceptsToken(savedLogin.token))) {
    emit({ kind: 'already-logged-in', email: savedLogin.email });
    return;
  }

  const pendingLogin = await serverCalls()
    .startCliLogin()
    .catch((error: Error) => throwError({ message: error.message, errorToReport: error }));

  emit({ kind: 'login-link', authorizeUrl: pendingLogin.authorizeUrl });
  const browserOpened = await browser().open(pendingLogin.authorizeUrl);
  emit({ kind: 'login-waiting', browserOpened });

  const answer = await waitForTheAnswer(pendingLogin);

  if (answer.status === 'approved') {
    savedLogins().save(serviceAddress, { token: answer.token, email: answer.email });
    emit({ kind: 'logged-in', email: answer.email });
    return;
  }

  refuseUnfinishedLogin(answer.status);
}

export default login;

/* ========================================================================== */

/**
 * Whether the service still accepts a saved login's token. One call that lists the person's teams
 * decides it: any refusal means the saved login is spent, and a fresh one replaces it.
 */
async function serviceAcceptsToken(personalToken: string): Promise<boolean> {
  return serverCalls()
    .listTeams({ personalToken })
    .then(
      () => true,
      () => false
    );
}

/** Ask the service until the person has answered the pending login. */
async function waitForTheAnswer(pendingLogin: PendingCliLogin): Promise<CliLoginAnswer> {
  const { loginId, pollSecret } = pendingLogin;

  for (;;) {
    const answer = await serverCalls()
      .pollCliLogin({ loginId, pollSecret })
      .catch((error: Error) => throwError({ message: error.message, errorToReport: error }));

    if (answer.status !== 'pending') return answer;

    await surroundings().sleep(POLL_INTERVAL_MS);
  }
}

/** A login that ended without a token: the person cancelled it, or nobody answered in time. */
function refuseUnfinishedLogin(status: 'cancelled' | 'expired' | 'used' | 'pending'): never {
  const sentence = {
    cancelled: 'The login was cancelled in the browser.',
    expired: 'The login expired: nobody clicked Authorize within 10 minutes.',
    used: 'This login was already collected by another run.',
    pending: 'The login was never answered.',
  }[status];

  // The refusal sits apart from the wait line above it, as the closers of a wait do.
  emit({ kind: 'blank-line' });
  throwError({ message: `${sentence}\n  Run \`sherlo ${LOGIN_COMMAND}\` to start a new one.` });
}
