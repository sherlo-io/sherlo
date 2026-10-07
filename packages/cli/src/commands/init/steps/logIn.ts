/**
 * STEP 2 - WHO IS SETTING UP? `--personal-token`, then SHERLO_PERSONAL_TOKEN, then the login saved
 * on this computer; only when there is none of them does setup run the browser login itself, the
 * same one `sherlo login` runs. So the person's only act in the whole setup is clicking Authorize,
 * and an agent given a personal token never opens a browser.
 *
 * How the login waits, and what it says while it waits, is epic SLH's (sherlo-login-hidden-tokens).
 */
import { PERSONAL_TOKEN_ENV_VAR } from '../../../constants';
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
    printLines([renderStepLine({ outcome: 'already', name: 'Logged in', detail: savedLogin.email })]);
  } else {
    const newLogin = await logInThroughTheBrowser(serviceAddress);
    printLines(['', renderStepLine({ outcome: 'done', name: 'Logged in', detail: newLogin.email })]);
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
