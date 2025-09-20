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

  throwError({ type: 'unexpected', error });
}

export default handleClientError;
