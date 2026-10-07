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
import { renderLoginLink, renderLoginWaiting } from '../../../render/login';
import { getEndpointUrl } from '../../../helpers/buildStatusRequest';
import { renderStepLine } from '../../../render/initSteps';
import { savedLogins } from '../../../seams/savedLogins';
import { logInThroughTheBrowser } from '../../login/login';
import type { ResolvedPersonalToken } from '../../shared/resolvePersonalToken';
import { printLines } from '../helpers';

async function logIn(): Promise<ResolvedPersonalToken> {
  const serviceAddress = getEndpointUrl();

  const savedLogin = savedLogins().read(serviceAddress);
  if (savedLogin) {
    // Not marked as already done: like the team and project lines after it, being logged in is
    // where setup starts from, not work it did.
    printLines([renderStepLine({ outcome: 'done', name: 'Logged in', detail: savedLogin.email })]);
    return { personalToken: savedLogin.token, fromSavedLogin: true };
  }

  // The login block stands apart from the list while it waits...
  printLines(['']);
  const newLogin = await logInThroughTheBrowser(serviceAddress);

  // ...and in a terminal, once Authorize is clicked, it gives way to one line like every other
  // step's. Where nothing can be erased - an agent reading a pipe - the block stays, and the line
  // follows it.
  // BUILD DEBT (init-for-agents): one shared check, in ../../../helpers, that every command asks
  // whether its output is a person's terminal - a TTY, with no CI set and TERM not "dumb", the
  // same test the spinner's library makes - so the spinner and this erase never disagree.
  if (process.stdout.isTTY && !process.env.CI && process.env.TERM !== 'dumb') {
    process.stdout.write(ansiEscapes.eraseLines(linesTheLoginPrinted(newLogin.browserOpened) + 1));
  } else {
    printLines(['']);
  }
  printLines([renderStepLine({ outcome: 'done', name: 'Logged in', detail: newLogin.email })]);

  return { personalToken: newLogin.token, fromSavedLogin: true };
}

export default logIn;

/* ========================================================================== */

/**
 * How many lines the login block took, counting the blank line above it: the link and the lines
 * around it (../../../render/login renderLoginLink), then the wait - one line, or three when the
 * browser did not open.
 */
function linesTheLoginPrinted(browserOpened: boolean): number {
  const blankLineAbove = 1;
  const linkBlock = renderLoginLink('').length;
  const waitBlock = renderLoginWaiting(browserOpened).length;

  return blankLineAbove + linkBlock + waitBlock;
}
