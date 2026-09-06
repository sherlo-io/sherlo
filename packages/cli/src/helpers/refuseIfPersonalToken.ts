import { APP_DOMAIN, PERSONAL_TOKEN_FLAG, TOKEN_OPTION } from '../constants';
import isPersonalToken from './isPersonalToken';
import throwError from './throwError';

/**
 * THE ONE SENTENCE THE CLI SAYS when a PERSONAL token is handed to something
 * that wants a PROJECT token.
 *
 * Every place that takes a project token calls this before doing anything else
 * with the string: the option validator, `sherlo init`'s requirement check, and
 * ../getTokenParts itself as the backstop for any path that reached the parser
 * without passing a validator. One function rather than three copies, because
 * three copies of an error message is three messages that drift, and the whole
 * point of the `sht_` prefix is that the CLI can be PRECISE about this mistake
 * rather than falling back on "invalid token".
 *
 * THE TOKEN IS NEVER PUT IN THE MESSAGE OR IN THE REPORT. It is a live
 * credential someone just mistyped a flag for; a refusal that echoes it into a
 * CI log or a crash report turns a harmless mistake into a leak.
 */
function refuseIfPersonalToken(token: string, optionName: string = TOKEN_OPTION): void {
  if (!isPersonalToken(token)) return;

  throwError({
    type: 'auth',
    message:
      `\`--${optionName}\` wants a project token, and this is a personal token.\n` +
      '\n' +
      '  A personal token (`sht_...`) names a PERSON. It carries no team and no\n' +
      '  project, so nothing here can tell which project you meant. A project token\n' +
      "  names exactly one project - copy it from that project's settings at\n" +
      `  ${APP_DOMAIN}.\n` +
      '\n' +
      `  The personal token belongs on \`--${PERSONAL_TOKEN_FLAG}\`, which today only\n` +
      '  `sherlo project create` takes.',
  });
}

export default refuseIfPersonalToken;
