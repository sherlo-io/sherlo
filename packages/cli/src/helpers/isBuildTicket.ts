import { BUILD_TICKET_PREFIX } from '../constants';

/**
 * Is this string a build ticket (BUILD_TICKET_PREFIX), the one-run credential an EAS build spends?
 * Like a personal token it is opaque and sent whole, never taken apart as a project token is.
 */
function isBuildTicket(token: string): boolean {
  return token.startsWith(BUILD_TICKET_PREFIX);
}

export default isBuildTicket;
