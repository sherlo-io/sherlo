import { docsLink } from '../constants';
import getErrorMessage from './getErrorMessage';

function getConfigErrorMessage(message: string, learnMoreLink?: string): string {
  return getErrorMessage({
    type: 'config',
    message,
    learnMoreLink: learnMoreLink ?? docsLink.config,
  });
}

export default getConfigErrorMessage;
