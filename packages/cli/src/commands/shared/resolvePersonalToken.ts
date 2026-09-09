/**
 * THE PERSONAL TOKEN, from the flag or the environment - refusing anything
 * that is not one BEFORE it is sent anywhere.
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
 */
import {
  PERSONAL_TOKEN_ENV_VAR,
  PERSONAL_TOKEN_FLAG,
  PERSONAL_TOKEN_PREFIX,
  TOKEN_OPTION,
} from '../../constants';
import { isPersonalToken, throwError } from '../../helpers';

function resolvePersonalToken(
  passedToken: string | undefined,
  { thisCommand, tokenContextLine }: { thisCommand: string; tokenContextLine: string }
): string {
  const personalToken = (passedToken ?? process.env[PERSONAL_TOKEN_ENV_VAR])?.trim();

  if (!personalToken) {
    throwError({
      type: 'auth',
      message:
        `\`sherlo ${thisCommand}\` needs a personal token: ` +
        `\`--${PERSONAL_TOKEN_FLAG} <token>\` or ${PERSONAL_TOKEN_ENV_VAR}.\n` +
        '\n' +
        '  Mint one in the Sherlo web app - the CLI cannot mint tokens, by design.\n' +
        `  This is NOT the project token from \`--${TOKEN_OPTION}\` / sherlo.config.json:\n` +
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

  return personalToken;
}

export default resolvePersonalToken;
