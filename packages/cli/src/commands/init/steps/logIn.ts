/**
 * STEP 2 - WHO IS SETTING UP? The login saved on this computer; with none, setup runs the browser
 * login itself, the same one `sherlo login` runs. So the person's only act in the whole setup is
 * clicking Authorize - on this computer, or on their phone when an agent with no browser hands them
 * the link.
 *
 * NO PERSONAL TOKEN (epic SLH, sherlo-login-hidden-tokens, operator decision 2026-10-07): personal
 * tokens are hidden behind an admin switch, so setup is planned on the login alone. How the login
 * waits, and what it says while it waits, is SLH's too.
 */
import ansiEscapes from 'ansi-escapes';
import { renderLoginLink } from '../../../render/login';
import { getEndpointUrl } from '../../../helpers/buildStatusRequest';
import { renderStepLine } from '../../../render/initSteps';
import { savedLogins, type SavedLogin } from '../../../seams/savedLogins';
import { logInThroughTheBrowser } from '../../login/login';
import { printLines } from '../helpers';

async function logIn(): Promise<SavedLogin> {
  const serviceAddress = getEndpointUrl();

  const savedLogin = savedLogins().read(serviceAddress);
  if (savedLogin) {
    // Not marked as already done: like the team and project lines after it, being logged in is
    // where setup starts from, not work it did.
    printLines([renderStepLine({ outcome: 'done', name: 'Logged in', detail: savedLogin.email })]);
    return savedLogin;
  }

  // The login block stands apart from the list while it waits...
  printLines(['']);
  const newLogin = await logInThroughTheBrowser(serviceAddress);

  // ...and in a terminal, once Authorize is clicked, it gives way to one line like every other
  // step's: the login's wait was a spinner there, gone by now, so only the link block is left to
  // erase. Where nothing can be erased - an agent reading a pipe - the block and its wait lines
  // stay, and the login already left a blank line under them.
  // BUILD DEBT (init-for-agents): one shared check, in ../../../helpers, that every command asks
  // whether its output is a person's terminal, so the login's spinner, init's spinners and this
  // erase never disagree. Today it is the login's own test.
  if (process.stderr.isTTY && process.stdout.isTTY) {
    process.stdout.write(ansiEscapes.eraseLines(linesTheLoginPrinted() + 1));
  }
  printLines([renderStepLine({ outcome: 'done', name: 'Logged in', detail: newLogin.email })]);

  return newLogin;
}

export default logIn;

/* ========================================================================== */

/**
 * How many lines the login block left in a terminal, counting the blank line above it: the link and
 * the lines around it (../../../render/login renderLoginLink). The wait was a spinner, which leaves
 * none.
 */
function linesTheLoginPrinted(): number {
  const blankLineAbove = 1;
  const linkBlock = renderLoginLink('').length;

  return blankLineAbove + linkBlock;
}
