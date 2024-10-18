import { DOCS_LINK } from '../constants';
import throwError from './throwError';

function handleClientError(error: any) {
  if (error.networkError?.statusCode === 401) {
    throwError({
      type: 'auth',
      message: 'token is invalid',
      learnMoreLink: DOCS_LINK.configToken,
    });
  }

  throwError({ type: 'unexpected', message: error.message });
}

export default handleClientError;
