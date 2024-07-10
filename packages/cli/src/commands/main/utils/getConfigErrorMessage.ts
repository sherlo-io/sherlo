import { getErrorMessage } from '../../../utils';
import { DOCS_LINK } from '../../../constants';

function getConfigErrorMessage(message: string, learnMoreLink?: string): string {
  return getErrorMessage({
    type: 'config',
    message,
    learnMoreLink: learnMoreLink ?? DOCS_LINK.config,
  });
}

export default getConfigErrorMessage;
