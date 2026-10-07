/**
 * STEP 2 - WHO IS SETTING UP? `--personal-token`, then SHERLO_PERSONAL_TOKEN, then the login saved
 * on this computer; only when there is none of them does setup run the browser login itself, the
 * same one `sherlo login` runs. So the person's only act in the whole setup is clicking Authorize,
 * and an agent given a personal token never opens a browser.
 *
 * How the login waits, and what it says while it waits, is epic SLH's (sherlo-login-hidden-tokens).
 */
import ansiEscapes from 'ansi-escapes';
import { PERSONAL_TOKEN_ENV_VAR } from '../../../constants';
import { renderLoginLink, renderLoginWaiting } from '../../../render/login';
import { getEndpointUrl } from '../../../helpers/buildStatusRequest';
import { renderStepLine } from '../../../render/initSteps';
import { savedLogins } from '../../../seams/savedLogins';
import { logInThroughTheBrowser } from '../../login/login';
import { resolvePersonalToken } from '../../shared';
import type { ResolvedPersonalToken } from '../../shared/resolvePersonalToken';
import { THIS_COMMAND } from '../constants';
import { printLines } from '../helpers';

async function logIn(personalTokenFlag: string | undefined): Promise<ResolvedPersonalToken> {
  const serviceAddress = getEndpointUrl();

  const hasGivenToken = Boolean(
    personalTokenFlag?.trim() || process.env[PERSONAL_TOKEN_ENV_VAR]?.trim()
  );
  const savedLogin = savedLogins().read(serviceAddress);

  if (hasGivenToken) {
    printLines([renderStepLine({ outcome: 'done', name: 'Logged in', detail: 'with your personal token' })]);
  } else if (savedLogin) {
    // Not marked as already done: like the team and project lines after it, being logged in is
    // where setup starts from, not work it did.
    printLines([renderStepLine({ outcome: 'done', name: 'Logged in', detail: savedLogin.email })]);
  } else {
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
  }

  // After a login there is a saved one, so this never refuses for want of a credential; it still
  // refuses a given token that is not a personal one.
  return resolvePersonalToken(personalTokenFlag, {
    thisCommand: THIS_COMMAND,
    tokenContextLine:
      'The project token names one project, and setup checks which projects you can reach.',
  });
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
