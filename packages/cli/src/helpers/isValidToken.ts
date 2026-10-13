import { PROJECT_API_TOKEN_LENGTH, TEAM_ID_LENGTH } from '@sherlo/shared';
import reporting from './reporting';
import getTokenParts from './getTokenParts';
import isPersonalToken from './isPersonalToken';

/**
 * Is this a well-formed PROJECT token? The question is about the composite
 * layout ../helpers/getTokenParts slices, and nothing else.
 *
 * A personal token is answered `false` here WITHOUT being parsed - both because
 * parsing one throws (see getTokenParts) and because the honest answer to "is
 * this a valid project token" for a perfectly good personal token is no. The
 * callers that can say something more useful than a boolean call
 * ./refuseIfPersonalToken first and never get here.
 */
function isValidToken(token: string): boolean {
  if (isPersonalToken(token)) {
    reporting.addBreadcrumb({
      category: 'auth',
      message:
        'Token validation failed - a personal token was given where a project token is required',
      level: 'warning',
    });

    return false;
  }

  const { apiToken, projectIndex, teamId } = getTokenParts(token);

  if (
    apiToken.length === PROJECT_API_TOKEN_LENGTH &&
    teamId.length === TEAM_ID_LENGTH &&
    Number.isInteger(projectIndex) &&
    projectIndex >= 1
  ) {
    reporting.setContext('Project', { teamId, projectIndex });
    reporting.setTag('team_id', teamId);
    // Sentry tags must be strings; projectIndex is a number from the parsed token.
    reporting.setTag('project_index', String(projectIndex));
    reporting.addBreadcrumb({
      category: 'auth',
      message: 'Token validated successfully',
      data: { teamId, projectIndex },
      level: 'info',
    });

    return true;
  }

  reporting.setContext('Project', { teamId: '[unknown]', projectIndex: '[unknown]' });
  reporting.addBreadcrumb({
    category: 'auth',
    message: 'Token validation failed — invalid format',
    level: 'warning',
  });

  return false;
}

export default isValidToken;
