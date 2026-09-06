import { PERSONAL_TOKEN_PREFIX } from '../constants';

/**
 * Is this string a PERSONAL token rather than a project token?
 *
 * The one place the two credentials are told apart, so the answer cannot differ
 * between the parser that would mis-slice one (./getTokenParts), the gate that
 * would mis-accept one (./isValidToken) and the command that needs one
 * (../commands/projectCreate). See PERSONAL_TOKEN_PREFIX for what each kind is.
 *
 * The prefix is the WHOLE test on purpose. This function decides which SHAPE a
 * string is, never whether it is live: a personal token is opaque and only the
 * backend can say whether it exists, is revoked, is expired, or carries the
 * scope. Checking the length here would turn a truncated paste - a mistake the
 * backend can name precisely - into a local guess.
 */
function isPersonalToken(token: string): boolean {
  return token.startsWith(PERSONAL_TOKEN_PREFIX);
}

export default isPersonalToken;
