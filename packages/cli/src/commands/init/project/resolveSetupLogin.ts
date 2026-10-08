/**
 * WHO IS RUNNING SETUP: the saved login, the one every management command spends
 * (../../shared/resolveLogin). When there is none, setup runs the browser login itself, the same
 * one `sherlo login` runs, and spends the login it saves. Setup takes no personal token from a
 * flag or a variable.
 */
import { getEndpointUrl } from '../../../helpers/buildStatusRequest';
import { emit } from '../../../helpers/transcriptSink';
import { savedLogins, type SavedLogin } from '../../../seams/savedLogins';
import { logInThroughTheBrowser } from '../../login/login';

async function resolveSetupLogin(): Promise<SavedLogin> {
  const serviceAddress = getEndpointUrl();

  const savedLogin = savedLogins().read(serviceAddress);
  if (savedLogin) return savedLogin;

  const newLogin = await logInThroughTheBrowser(serviceAddress);
  // Setup is already `npx sherlo init`, so the line carries no next step pointing back at it.
  emit({ kind: 'logged-in', email: newLogin.email, insideSetup: true });

  return newLogin;
}

export default resolveSetupLogin;
