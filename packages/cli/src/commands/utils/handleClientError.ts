import { getErrorMessage } from '../../utils';
import { DOCS_LINK } from '../../constants';

function handleClientError(error: any) {
  if (error.networkError?.statusCode === 401) {
    throw new Error(
      getErrorMessage({
        type: 'auth',
        message: 'token is invalid',
        learnMoreLink: DOCS_LINK.configToken,
      })
    );
  }

  throw new Error(getErrorMessage({ type: 'unexpected', message: error.message }));
}

export default handleClientError;
