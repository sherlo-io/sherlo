import { APP_DOMAIN } from '../constants';
import refuseRejectedLogin from '../commands/shared/refuseRejectedLogin';
import { printLink } from '../helpers';
import { savedLogins } from '../seams/savedLogins';
import { getEndpointUrl } from './buildStatusRequest';
import throwError from './throwError';

/**
 * `token` is the one the failed request was sent with. When it is the login saved on this
 * computer, a refusal says to log in again rather than to check a token nobody typed.
 */
function handleClientError(error: any, token?: string): never {
  if (error.networkError?.statusCode === 401) {
    const savedLogin = savedLogins().read(getEndpointUrl());

    if (token !== undefined && token === savedLogin?.token) refuseRejectedLogin();

    throwError({
      type: 'auth',
      message:
        'Invalid token\n\n' +
        'Please:\n' +
        '- Make sure you copied it correctly, or\n' +
        `- Generate a new one at ${printLink(APP_DOMAIN)}\n`,
    });
  }

  if (error.message === 'snapshotsLimitIsExceeded') {
    throwError({
      type: 'default',
      message: 'Snapshots limit is exceeded. Contact the team owner to upgrade the plan.',
    });
  }

  if (error.message === 'planIsInactive') {
    throwError({
      type: 'default',
      message: 'Your plan is inactive. Contact the team owner to update the payment.',
    });
  }

  throwError({ type: 'unexpected', error });
}

export default handleClientError;
