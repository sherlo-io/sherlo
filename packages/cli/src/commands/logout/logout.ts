/**
 * `sherlo logout` - end this terminal's login (sherlo / Logging in from the terminal).
 *
 * It ends the login on the service, then deletes it from this computer. When the service cannot be
 * reached, the login is still deleted here, and the command says the login could not be ended on
 * the service and exits 1: it stays usable until it runs out, or is revoked in the web app. When
 * the service answers but refuses the token, the login was already ended there (revoked, or run
 * out): it is deleted here and the logout ends as an ordinary one, exit 0. With no saved login, it
 * says so and exits 0.
 *
 * Only the login of the service address in use is touched.
 */
import { printSherloIntro, throwError } from '../../helpers';
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import { emit } from '../../helpers/transcriptSink';
import { savedLogins } from '../../seams/savedLogins';
import { serverCalls, ServiceRefusedTokenError } from '../../seams/serverCalls';

async function logout(): Promise<void> {
  printSherloIntro();

  const serviceAddress = getEndpointUrl();

  const savedLogin = savedLogins().read(serviceAddress);
  if (!savedLogin) {
    emit({ kind: 'not-logged-in' });
    return;
  }

  // A token the service refuses is already ended there - revoked, or run out - so only a service
  // the tool could not reach leaves the login alive on the service.
  const endedOnTheService = await serverCalls()
    .logOutCli({ personalToken: savedLogin.token })
    .then(
      () => true,
      (error: Error) => error instanceof ServiceRefusedTokenError
    );

  savedLogins().remove(serviceAddress);

  if (!endedOnTheService) {
    throwError({
      message:
        `Deleted the login of ${savedLogin.email} from this computer, but Sherlo could not be reached to end it there.\n` +
        '  Until it expires, revoke it in the web app.\n' +
        '  Open Account settings, then Personal tokens.',
    });
  }

  emit({ kind: 'logged-out', email: savedLogin.email });
}

export default logout;
