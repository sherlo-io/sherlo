import { projectApiTokenLength, teamIdLength } from '@sherlo/shared';
import { docsLink } from '../../constants';
import { getTokenParts } from '../../utils';
import { InvalidatedConfig } from '../../types';
import getConfigErrorMessage from './getConfigErrorMessage';

function validateConfigToken<T extends InvalidatedConfig>(
  config: InvalidatedConfig
): asserts config is T & { token: string } {
  const { token } = config;

  if (!token || typeof token !== 'string') {
    throw new Error(getConfigErrorMessage('token must be a defined string', docsLink.configToken));
  }

  const { apiToken, projectIndex, teamId } = getTokenParts(token);

  if (
    apiToken.length !== projectApiTokenLength ||
    teamId.length !== teamIdLength ||
    !Number.isInteger(projectIndex) ||
    projectIndex < 1
  ) {
    throw new Error(getConfigErrorMessage('token is not valid', docsLink.configToken));
  }
}

export default validateConfigToken;
