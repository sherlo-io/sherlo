import { PERSONAL_TOKEN_PREFIX } from '@sherlo/api-types';

/**
 * Is this string a PERSONAL token rather than a project token?
 *
 * The one place the two credentials are told apart, so the answer cannot differ
 * between the parser that would mis-slice one (./getTokenParts), the gate that
 * would mis-accept one (./isValidToken) and the command that needs one
 * (../commands/projectCreate).
 *
 *   A PROJECT TOKEN is a composite the CLI parses locally: 32 random chars,
 *   then an 8-char teamId, then the project index (./getTokenParts). It
 *   carries NO prefix, it names one project, and it is what `--token` /
 *   `SHERLO_TOKEN` / `sherlo.config.json` mean everywhere in this CLI. It runs
 *   tests and reads builds.
 *
 *   A PERSONAL TOKEN is `sht_` + 32 opaque chars. It carries NO team and NO
 *   project - it is resolved server-side to the PERSON it belongs to, and what
 *   it may do is cut to that person's current role on the team the request
 *   names. The login `sherlo login` saves is one, and the tool takes no other:
 *   no flag and no variable carries a personal token.
 *
 * SLICING A PERSONAL TOKEN THE WAY A PROJECT TOKEN IS SLICED WOULD PRODUCE A
 * PLAUSIBLE-LOOKING TEAM ID out of eight characters of random, so every place
 * that takes a project token asks this first and refuses a personal one by name.
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
