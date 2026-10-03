/**
 * WHO IS RUNNING SETUP: `--personal-token`, then SHERLO_PERSONAL_TOKEN, then the saved login - the
 * order every management command spends them in (../../shared/resolvePersonalToken). Only when
 * there is none of them does setup run the browser login itself, the same one `sherlo login` runs,
 * and spend the login it saves. So an agent given a personal token never starts a browser.
 */
import { PERSONAL_TOKEN_ENV_VAR } from '../../../constants';
import { getEndpointUrl } from '../../../helpers/buildStatusRequest';
import { emit } from '../../../helpers/transcriptSink';
import { savedLogins } from '../../../seams/savedLogins';
import { logInThroughTheBrowser } from '../../login/login';
import { resolvePersonalToken } from '../../shared';
import type { ResolvedPersonalToken } from '../../shared/resolvePersonalToken';
import { THIS_COMMAND } from '../constants';

async function resolveSetupPersonalToken(
  personalTokenFlag: string | undefined
): Promise<ResolvedPersonalToken> {
  const serviceAddress = getEndpointUrl();

  const hasGivenToken = Boolean(
    personalTokenFlag?.trim() || process.env[PERSONAL_TOKEN_ENV_VAR]?.trim()
  );
  const hasSavedLogin = savedLogins().read(serviceAddress) !== undefined;

  if (!hasGivenToken && !hasSavedLogin) {
    const newLogin = await logInThroughTheBrowser(serviceAddress);
    emit({ kind: 'logged-in', email: newLogin.email });
  }

  // After a login there is a saved one, so this never refuses for want of a credential; it still
  // refuses a given token that is not a personal one.
  return resolvePersonalToken(personalTokenFlag, {
    thisCommand: THIS_COMMAND,
    tokenContextLine:
      'The project token names one project, and setup checks which projects you can reach.',
  });
}

export default resolveSetupPersonalToken;
