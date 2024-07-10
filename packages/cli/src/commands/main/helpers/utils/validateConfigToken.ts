import { projectApiTokenLength, teamIdLength } from '@sherlo/shared';
import { DOCS_LINK } from '../../../../constants';
import { getTokenParts } from '../../../utils';
import { InvalidatedConfig } from '../../types';
import { getConfigErrorMessage } from '../../utils';

function validateConfigToken<T extends InvalidatedConfig>(
  config: InvalidatedConfig
): asserts config is T & { token: string } {
  const { token } = config;

  if (!token || typeof token !== 'string') {
    throw new Error(
      getConfigErrorMessage('`token` must be a defined string', DOCS_LINK.configToken)
    );
  }

  const { apiToken, projectIndex, teamId } = getTokenParts(token);

  if (
    apiToken.length !== projectApiTokenLength ||
    teamId.length !== teamIdLength ||
    !Number.isInteger(projectIndex) ||
    projectIndex < 1
  ) {
    throw new Error(getConfigErrorMessage('`token` is not valid', DOCS_LINK.configToken));
  }
}

export default validateConfigToken;
