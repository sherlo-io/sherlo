/**
 * `sherlo login` - sign this terminal in to Sherlo through the browser, once (sherlo / Logging in
 * from the terminal).
 *
 *   1. A saved login the service still accepts ends here: "Already logged in", exit 0.
 *   2. Otherwise it picks up the pending login an earlier run left, while that one has not
 *      expired, or starts a new one and keeps it. Either way it says the browser is opening,
 *      prints the authorize link on its own line, and opens the browser on it.
 *   3. It asks the service about every two seconds until the person answers, or until the pending
 *      login's own expiry, which the service set.
 *   4. Authorize: the login is saved and the person's email printed, exit 0. Cancel, or nobody
 *      before the expiry: it says which, exit 1. The pending login is forgotten in every one of
 *      these endings, and kept in no other - so a run that was killed, or lost the service, leaves
 *      it for the next run to wait on.
 *
 * EVERYTHING THIS COMMAND TOUCHES IS A SEAM - the service (../../seams/serverCalls), the browser
 * (../../seams/browser), the saved and pending logins (../../seams/savedLogins) and the clock
 * (../../seams/surroundings) - so a pose draws every screen it prints. The token the service hands
 * over is saved and never printed.
 */
import { printSherloIntro, spinner, throwError } from '../../helpers';
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import { emit } from '../../helpers/transcriptSink';
import { renderLoginWaitingSpinner } from '../../render/login';
import { browser } from '../../seams/browser';
import {
  hasExpired,
  savedLogins,
  type PendingLogin,
  type SavedLogin,
} from '../../seams/savedLogins';
import { serverCalls } from '../../seams/serverCalls';
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
 * THE WHOLE BROWSER LOGIN, for every command that needs one: pick up the pending login an earlier
 * run left under `serviceAddress`, or start and keep a new one; print its link and open the
 * browser on it; wait for the person; and save the login under `serviceAddress`. Answers the saved
 * login. A login that ends without a token is refused, exit 1.
 *
 * It prints the link and the wait, and nothing after them: what a finished login means is the
 * calling command's to say.
 */
export async function logInThroughTheBrowser(serviceAddress: string): Promise<SavedLogin> {
  const pendingLogin =
    savedLogins().readPending(serviceAddress) ?? (await startNewLogin(serviceAddress));

  emit({ kind: 'login-link', authorizeUrl: pendingLogin.authorizeUrl });
  await browser().open(pendingLogin.authorizeUrl);

  const answer = await whileShowingTheWait(() => waitForTheAnswer(pendingLogin));

  // Collected, cancelled, expired or used: the pending login is spent in every one of them.
  savedLogins().removePending(serviceAddress);

  if (answer.status !== 'approved') refuseUnfinishedLogin(answer.status, pendingLogin);

  const newLogin: SavedLogin = { token: answer.token, email: answer.email };
  savedLogins().save(serviceAddress, newLogin);

  return newLogin;
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
 * Start a pending login on the service, and keep it under `serviceAddress` straight away, so a run
 * that is killed while it waits leaves it for the next run.
 */
async function startNewLogin(serviceAddress: string): Promise<PendingLogin> {
  const pendingLogin = await serverCalls()
    .startCliLogin()
    .catch((error: Error) => throwError({ message: error.message, errorToReport: error }));

  savedLogins().savePending(serviceAddress, pendingLogin);

  return pendingLogin;
}

/**
 * Run `wait` while the wait is shown. On a terminal it is a spinner, cleared when the wait ends so
 * the result takes its place under the link's own blank line; anywhere else - a log, a pipe, an
 * agent's shell - it is the plain waiting line, which stays, with one blank line under it.
 */
async function whileShowingTheWait<Answer>(wait: () => Promise<Answer>): Promise<Answer> {
  if (!process.stderr.isTTY) {
    emit({ kind: 'login-waiting' });
    try {
      return await wait();
    } finally {
      // However the wait ended, the result sits one blank line below the waiting lines.
      emit({ kind: 'blank-line' });
    }
  }

  // Enabled outright: whether this is a terminal was just decided, and the spinner's own guess
  // would also read a CI variable.
  const waitingSpinner = spinner({ text: renderLoginWaitingSpinner(), isEnabled: true }).start();
  try {
    return await wait();
  } finally {
    waitingSpinner.stop();
  }
}

/**
 * Ask the service until the person has answered the pending login. A login still pending once its
 * `expiresAt` has passed - or whose `expiresAt` is not a time at all - ends as expired, without
 * asking again.
 */
async function waitForTheAnswer(pendingLogin: PendingLogin): Promise<FinishedLogin> {
  const { loginId, pollSecret } = pendingLogin;

  for (;;) {
    const answer = await serverCalls()
      .pollCliLogin({ loginId, pollSecret })
      .catch((error: Error) => throwError({ message: error.message, errorToReport: error }));

    if (answer.status === 'approved') return answer;
    if (answer.status !== 'pending') return { status: answer.status };

    if (hasExpired(pendingLogin)) return { status: 'expired' };

    await surroundings().sleep(POLL_INTERVAL_MS);
  }
}

/** A login that ended without a token: the person cancelled it, or nobody answered in time. */
function refuseUnfinishedLogin(
  status: 'cancelled' | 'expired' | 'used',
  pendingLogin: PendingLogin
): never {
  const sentence = {
    cancelled: 'The login was canceled in the browser.',
    expired: describeExpiry(pendingLogin.expiresAt),
    used: 'This login was already collected by another run.',
  }[status];

  throwError({
    message: `${sentence}\n  Run \`npx sherlo ${LOGIN_COMMAND}\` to start a new one.`,
  });
}

/**
 * When the login expired, read from the expiry the service gave it - never a fixed number of
 * minutes. Written in UTC, so the same expiry reads the same on every machine.
 */
function describeExpiry(expiresAt: string): string {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return 'The login expired. Nobody clicked Authorize in time.';

  const hoursAndMinutes = expiry.toISOString().slice(11, 16);
  return `The login expired at ${hoursAndMinutes} UTC. Nobody clicked Authorize in time.`;
}
