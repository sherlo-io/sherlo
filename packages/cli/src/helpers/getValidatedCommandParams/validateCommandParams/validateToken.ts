import { DOCS_LINK } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import isValidToken from '../../isValidToken';
import refuseIfPersonalToken from '../../refuseIfPersonalToken';
import throwError from '../../throwError';
import refuseWithoutProjectToken from './refuseWithoutProjectToken';

function validateToken<T extends InvalidatedConfig>(
  command: string,
  config: InvalidatedConfig
): asserts config is T & { token: string } {
  const { token } = config;

  // No project token: what is wrong with the credential that is left is said in
  // ./refuseWithoutProjectToken. The config's `project` is not in the Config type yet.
  if (token === undefined) {
    refuseWithoutProjectToken(command, config as { project?: unknown });
  }

  if (typeof token !== 'string') {
    throwError(getError('invalid_type'));
  }

  // Before the format check, because "invalid token" is the wrong thing to say
  // to someone who pasted a perfectly good credential of the other kind.
  refuseIfPersonalToken(token);

  if (!isValidToken(token)) {
    throwError(getError('invalid_format'));
  }
}

function getError(type: 'invalid_type' | 'invalid_format') {
  const messages = {
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
