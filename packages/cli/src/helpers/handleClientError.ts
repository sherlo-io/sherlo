import { APP_DOMAIN } from '../constants';
import { printLink } from '../helpers';
import throwError from './throwError';

function handleClientError(error: any) {
  if (error.networkError?.statusCode === 401) {
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
