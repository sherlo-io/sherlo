import { GITHUB_SESSION_PREFIX } from '../constants';
import isBuildTicket from './isBuildTicket';
import isPersonalToken from './isPersonalToken';

/**
 * Is this token opaque - a personal token, a build ticket or a GitHub session - so it is sent whole
 * and never taken apart by `getTokenParts`, which only a project token has the layout for?
 */
function hasNoTokenParts(token: string): boolean {
  return isPersonalToken(token) || isBuildTicket(token) || token.startsWith(GITHUB_SESSION_PREFIX);
}

export default hasNoTokenParts;
