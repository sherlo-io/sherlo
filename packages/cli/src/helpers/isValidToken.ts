import { PROJECT_API_TOKEN_LENGTH, TEAM_ID_LENGTH } from '@sherlo/shared';
import { reporting } from '../helpers';
import getTokenParts from './getTokenParts';

function isValidToken(token: string): boolean {
  const { apiToken, projectIndex, teamId } = getTokenParts(token);

  if (
    apiToken.length === PROJECT_API_TOKEN_LENGTH &&
    teamId.length === TEAM_ID_LENGTH &&
    Number.isInteger(projectIndex) &&
    projectIndex >= 1
  ) {
    reporting.setContext('Project', { teamId, projectIndex });

    return true;
  }

  reporting.setContext('Project', { teamId: '[unknown]', projectIndex: '[unknown]' });

  return false;
}

export default isValidToken;
