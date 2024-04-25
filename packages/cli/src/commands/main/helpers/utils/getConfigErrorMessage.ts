import { getErrorMessage } from '../../utils';
import { docsLink } from '../../constants';

function getConfigErrorMessage(message: string, learnMoreLink?: string): string {
  return getErrorMessage({
    type: 'config',
    message,
    learnMoreLink: learnMoreLink ?? docsLink.config,
  });
}

export default getConfigErrorMessage;
