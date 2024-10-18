import { DOCS_LINK } from '../constants';
import throwError from './throwError';

function throwConfigError(message: string, learnMoreLink?: string): never {
  return throwError({
    type: 'config',
    message,
    learnMoreLink: learnMoreLink ?? DOCS_LINK.config,
  });
}

export default throwConfigError;
