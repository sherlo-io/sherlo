import { PERSONAL_TOKEN_FLAG, PERSONAL_TOKEN_PREFIX } from '../constants';
import isPersonalToken from './isPersonalToken';
import throwError from './throwError';

/**
 * THE ONE REFUSAL the CLI gives when something that is not a personal token is about to be spent
 * as one - the mirror of ./refuseIfPersonalToken.
 *
 * Every place that spends a person's credential calls it before sending anything: the management
 * commands (../commands/shared/resolvePersonalToken) and a push or a view on `--personal-token`,
 * SHERLO_PERSONAL_TOKEN or the saved login
 * (./getValidatedCommandParams/validateCommandParams/resolvePushCredential). Without it a project
 * token pasted where a personal token belongs would be cut up and sent as somebody's login.
 *
 * THE TOKEN IS NEVER PUT IN THE MESSAGE: it is a live credential.
 */
function refuseIfNotPersonalToken(token: string): void {
  if (isPersonalToken(token)) return;

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

export default refuseIfNotPersonalToken;
