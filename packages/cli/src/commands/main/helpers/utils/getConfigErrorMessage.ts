import { getErrorMessage } from '../../utils';

function getConfigErrorMessage(message: string, learnMoreLink?: string): string {
  return getErrorMessage({
    type: 'config',
    message,
    learnMoreLink: learnMoreLink ?? 'https://docs.sherlo.io/getting-started/config',
  });
}

export default getConfigErrorMessage;
