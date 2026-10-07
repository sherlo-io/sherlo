/**
 * `sherlo login` - sign this terminal in to Sherlo through the browser, once (sherlo / Logging in
 * from the terminal).
 *
 *   1. A saved login the service still accepts ends here: "Already logged in", exit 0.
 *   2. Otherwise it starts a pending login, prints the authorize link on its own line, and opens
 *      the browser on it.
 *   3. It asks the service about every two seconds until the person answers, or until the pending
 *      login expires.
 *   4. Authorize: the login is saved and the person's email printed, exit 0. Cancel, or nobody in
 *      ten minutes: it says which, exit 1.
 *
 * EVERYTHING THIS COMMAND TOUCHES IS A SEAM - the service (../../seams/serverCalls), the browser
 * (../../seams/browser), the saved-login file (../../seams/savedLogins) and the clock
 * (../../seams/surroundings) - so a pose draws every screen it prints. The token the service hands
 * over is saved and never printed.
 */
import { printSherloIntro, throwError } from '../../helpers';
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import { emit } from '../../helpers/transcriptSink';
import { browser } from '../../seams/browser';
import { savedLogins, type SavedLogin } from '../../seams/savedLogins';
import { serverCalls, type PendingCliLogin } from '../../seams/serverCalls';
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

  const newLogin = await logInThroughTheBrowser(serviceAddress);
  emit({ kind: 'logged-in', email: newLogin.email });
}

export default login;

/**
 * THE WHOLE BROWSER LOGIN, for every command that needs one: start a pending login, print its
 * link and open the browser on it, wait for the person, and save the login under `serviceAddress`.
 * Answers the saved login. A login that ends without a token is refused, exit 1.
 *
 * It prints the link and the wait, and nothing after them: what a finished login means is the
 * calling command's to say.
 */
export async function logInThroughTheBrowser(
  serviceAddress: string
): Promise<SavedLogin & { browserOpened: boolean }> {
  const pendingLogin = await serverCalls()
    .startCliLogin()
    .catch((error: Error) => throwError({ message: error.message, errorToReport: error }));

  emit({ kind: 'login-link', authorizeUrl: pendingLogin.authorizeUrl });
  const browserOpened = await browser().open(pendingLogin.authorizeUrl);
  emit({ kind: 'login-waiting', browserOpened });

  const answer = await waitForTheAnswer(pendingLogin);
  if (answer.status !== 'approved') refuseUnfinishedLogin(answer.status);

  const newLogin: SavedLogin = { token: answer.token, email: answer.email };
  savedLogins().save(serviceAddress, newLogin);

  // Whether the browser came up decides how many lines the wait printed, which `sherlo init`
  // erases once the login is done.
  return { ...newLogin, browserOpened };
}

/* ========================================================================== */

/** How a pending login ended: with a token, or with the reason it has none. */
type FinishedLogin =
  | { status: 'approved'; email: string; token: string }
  | { status: 'cancelled' | 'expired' | 'used' };

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

/**
 * Ask the service until the person has answered the pending login. A login still pending once its
 * `expiresAt` has passed - or whose `expiresAt` is not a time at all - ends as expired, without
 * asking again.
 */
async function waitForTheAnswer(pendingLogin: PendingCliLogin): Promise<FinishedLogin> {
  const { loginId, pollSecret } = pendingLogin;
  const expiresAt = Date.parse(pendingLogin.expiresAt);

  for (;;) {
    const answer = await serverCalls()
      .pollCliLogin({ loginId, pollSecret })
      .catch((error: Error) => throwError({ message: error.message, errorToReport: error }));

    if (answer.status === 'approved') return answer;
    if (answer.status !== 'pending') return { status: answer.status };

    // An `expiresAt` that is not a time has no end to wait for, so it counts as passed: a wait
    // that could never end is worse than a login started again.
    const expiryHasPassed = Number.isNaN(expiresAt) || surroundings().now() >= expiresAt;
    if (expiryHasPassed) return { status: 'expired' };

    await surroundings().sleep(POLL_INTERVAL_MS);
  }
}

/** A login that ended without a token: the person cancelled it, or nobody answered in time. */
function refuseUnfinishedLogin(status: 'cancelled' | 'expired' | 'used'): never {
  const sentence = {
    cancelled: 'The login was canceled in the browser.',
    expired: 'The login expired. Nobody clicked Authorize within 10 minutes.',
    used: 'This login was already collected by another run.',
  }[status];

  // The refusal sits apart from the wait line above it, as the closers of a wait do.
  emit({ kind: 'blank-line' });
  throwError({ message: `${sentence}\n  Run \`sherlo ${LOGIN_COMMAND}\` to start a new one.` });
}
