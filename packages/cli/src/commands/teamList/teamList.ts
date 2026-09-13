/**
 * `sherlo team list` - the account-scoped sibling of `project list`. Same
 * credential (a PERSONAL token), no `--team` flag: it answers with every team
 * the token's owner belongs to, not one named team.
 */
import { PERSONAL_TOKEN_OPTION } from '../../constants';
import { printSherloIntro, throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { resolvePersonalToken } from '../shared';
import listTeamsRequest, { ListTeamsAuthError } from './listTeamsRequest';
import { THIS_COMMAND } from './constants';

export type TeamListOptions = {
  [PERSONAL_TOKEN_OPTION]?: string;
};

async function teamList(passedOptions: TeamListOptions): Promise<void> {
  printSherloIntro();

  const personalToken = resolvePersonalToken(passedOptions[PERSONAL_TOKEN_OPTION], {
    thisCommand: THIS_COMMAND,
    tokenContextLine: 'that one names a project; this command lists the teams you belong to.',
  });

  const list = await listTeamsRequest({ personalToken }).catch((error: Error) => {
    if (error instanceof ListTeamsAuthError) refuseRejectedToken();

    throwError({ message: error.message, errorToReport: error });
  });

  emit({ kind: 'team-list', list });
}

export default teamList;

/* ========================================================================== */

/**
 * What the CLI says when the backend refuses the token. Narrower than
 * ../projectCreate/projectCreate's version: `listTeams` answers from the
 * caller's own memberships, so there is no team id to name and no membership
 * check to fail - only the token itself and its scope can be wrong.
 */
function refuseRejectedToken(): never {
  throwError({
    type: 'auth',
    message:
      'The API refused this personal token.\n' +
      '\n' +
      '  It does not say which of these it is, so check them in this order:\n' +
      '    - the token is revoked or expired (the web app lists both);\n' +
      '    - it was minted without the `team:read` scope;\n' +
      '    - the token was mistyped or truncated in transit.',
  });
}
