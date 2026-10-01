/**
 * THE PERSONAL TOKEN, from the flag, the environment or the saved login, in
 * that order - refusing anything that is not one BEFORE it is sent anywhere
 * (sherlo / Teams, projects and the personal token). The saved login is read
 * through ../../seams/savedLogins, under the service address this run talks to.
 *
 * Shared across every management command (`project create`, `project list`,
 * `team create`, `team list`): all four take the same two flags
 * (`--personal-token` / `SHERLO_PERSONAL_TOKEN`) and refuse the same way, so
 * the resolution logic lives once here rather than four times with the risk
 * of the copies drifting. See ../projectCreate/projectCreate for the whole
 * story of why `--personal-token` exists as its own flag.
 *
 * `tokenContextLine` is the one line that differs per command - what a
 * project token would mean for THIS operation - because "the project does not
 * exist yet" (project create) reads as nonsense on `team list`.
 *
 * It also answers whether the token came from the saved login, because a
 * refused saved login is answered differently from a refused token somebody
 * gave: the person runs `sherlo login` again (./refuseRejectedLogin).
 */
import {
  PERSONAL_TOKEN_ENV_VAR,
  PERSONAL_TOKEN_FLAG,
  PERSONAL_TOKEN_PREFIX,
  TOKEN_OPTION,
} from '../../constants';
import { isPersonalToken, throwError } from '../../helpers';
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import { savedLogins } from '../../seams/savedLogins';
import { LOGIN_COMMAND } from '../login/constants';

/** The personal token a management command spends, and whether it is the saved login's. */
export type ResolvedPersonalToken = { personalToken: string; fromSavedLogin: boolean };

function resolvePersonalToken(
  passedToken: string | undefined,
  { thisCommand, tokenContextLine }: { thisCommand: string; tokenContextLine: string }
): ResolvedPersonalToken {
  const givenToken = (passedToken ?? process.env[PERSONAL_TOKEN_ENV_VAR])?.trim();

  // A token given on purpose always beats the login, so it is never overridden by whoever is
  // logged in. The login is a personal token the tool keeps, and is checked like one below.
  const personalToken = givenToken || savedLogins().read(getEndpointUrl())?.token;

  if (!personalToken) {
    throwError({
      type: 'auth',
      message:
        `\`sherlo ${thisCommand}\` needs you to be logged in. Run \`sherlo ${LOGIN_COMMAND}\`.\n` +
        `  Or pass a personal token with \`--${PERSONAL_TOKEN_FLAG}\` or ${PERSONAL_TOKEN_ENV_VAR}.\n` +
        `  That is not the project token from \`--${TOKEN_OPTION}\` or sherlo.config.json.\n` +
        `  ${tokenContextLine}`,
    });
  }

  if (!isPersonalToken(personalToken)) {
    throwError({
      type: 'auth',
      message:
        `\`--${PERSONAL_TOKEN_FLAG}\` wants a personal token, and this is not one - a ` +
        `personal\n  token starts with \`${PERSONAL_TOKEN_PREFIX}\`.\n` +
        '\n' +
        '  If you pasted your project token: that one names an existing project, not a\n' +
        '  person. Mint a personal token in the Sherlo web app.',
    });
  }

  return { personalToken, fromSavedLogin: !givenToken };
}

export default resolvePersonalToken;
