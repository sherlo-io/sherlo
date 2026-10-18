import getTokenParts from './getTokenParts';
import hasNoTokenParts from './hasNoTokenParts';

/**
 * What the service is sent for the token a push spends: a project token's api part, or any token
 * with no parts (./hasNoTokenParts) whole.
 */
function authTokenFor(token: string): string {
  return hasNoTokenParts(token) ? token : getTokenParts(token).apiToken;
}

export default authTokenFor;
