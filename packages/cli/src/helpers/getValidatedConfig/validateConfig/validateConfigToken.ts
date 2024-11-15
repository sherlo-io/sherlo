import { PROJECT_API_TOKEN_LENGTH, TEAM_ID_LENGTH } from '@sherlo/shared';
import { DOCS_LINK } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import getTokenParts from '../../getTokenParts';
import throwConfigError from '../../throwConfigError';

function validateConfigToken<T extends InvalidatedConfig>(
  config: InvalidatedConfig
): asserts config is T & { token: string } {
  const { token } = config;

  if (!token || typeof token !== 'string') {
    throwConfigError('`token` must be a defined string', DOCS_LINK.configToken);
  }

  const { apiToken, projectIndex, teamId } = getTokenParts(token);

  if (
    apiToken.length !== PROJECT_API_TOKEN_LENGTH ||
    teamId.length !== TEAM_ID_LENGTH ||
    !Number.isInteger(projectIndex) ||
    projectIndex < 1
  ) {
    throwConfigError('`token` is not valid', DOCS_LINK.configToken);
  }
}

export default validateConfigToken;
