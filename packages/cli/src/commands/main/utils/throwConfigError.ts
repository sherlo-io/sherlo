import { throwError } from '../../../utils';
import { DOCS_LINK } from '../../../constants';

function throwConfigError(message: string, learnMoreLink?: string): never {
  return throwError({
    type: 'config',
    message,
    learnMoreLink: learnMoreLink ?? DOCS_LINK.config,
  });
}

export default throwConfigError;
