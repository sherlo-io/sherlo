import { PROJECT_API_TOKEN_LENGTH, TEAM_ID_LENGTH } from '@sherlo/shared';
import { DOCS_LINK } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import getTokenParts from '../../getTokenParts';
import throwError from '../../throwError';

function validateToken<T extends InvalidatedConfig>(
  config: InvalidatedConfig
): asserts config is T & { token: string } {
  const { token } = config;

  if (token === undefined) {
    throwError(getError('missing'));
  }

  if (typeof token !== 'string') {
    throwError(getError('invalid_type'));
  }

  const { apiToken, projectIndex, teamId } = getTokenParts(token);

  if (
    apiToken.length !== PROJECT_API_TOKEN_LENGTH ||
    teamId.length !== TEAM_ID_LENGTH ||
    !Number.isInteger(projectIndex) ||
    projectIndex < 1
  ) {
    throwError(getError('invalid_format'));
  }
}

function getError(type: 'missing' | 'invalid_type' | 'invalid_format') {
  const messages = {
    missing:
      'Required property `token` is missing. Pass it using `--token` flag or add it to the config file',
    invalid_type: 'Property `token` must be a string',
    invalid_format:
      'Invalid `token` value. Make sure you copied it correctly or generate a new one in Sherlo web app',
  };

  return {
    message: messages[type],
    learnMoreLink: DOCS_LINK.configToken,
  };
}

export default validateToken;
