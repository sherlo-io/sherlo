import { DOCS_LINK } from '../constants';
import throwError from './throwError';

function handleClientError(error: any) {
  if (error.networkError?.statusCode === 401) {
    throwError({
      type: 'auth',
      message:
        'Invalid token\n\n' +
        'Please:\n' +
        '1. Make sure you copied it correctly\n' +
        '2. Generate a new one in Sherlo web app if needed\n',
      learnMoreLink: DOCS_LINK.configToken,
    });
  }

  throwError({ type: 'unexpected', error });
}

export default handleClientError;
