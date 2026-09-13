/**
 * `sherlo team create --name <name>` - the read-free sibling of
 * `project create`: same credential (a PERSONAL token), no `--team` flag,
 * because there is no team yet to name.
 */
import { MAX_TEAM_NAME_LENGTH, NAME_OPTION, PERSONAL_TOKEN_OPTION } from '../../constants';
import { printSherloIntro, reporting, throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { resolvePersonalToken } from '../shared';
import createTeamRequest, { CreateTeamAuthError } from './createTeamRequest';
import { THIS_COMMAND } from './constants';

export type TeamCreateOptions = {
  [NAME_OPTION]?: string;
  [PERSONAL_TOKEN_OPTION]?: string;
};

async function teamCreate(passedOptions: TeamCreateOptions): Promise<void> {
  printSherloIntro();

  const name = resolveName(passedOptions[NAME_OPTION]);
  const personalToken = resolvePersonalToken(passedOptions[PERSONAL_TOKEN_OPTION], {
    thisCommand: THIS_COMMAND,
    tokenContextLine: 'that one names a project; this command creates a team, not a project.',
  });

  const team = await createTeamRequest({ name, personalToken }).catch((error: Error) => {
    if (error instanceof CreateTeamAuthError) refuseRejectedToken();

    throwError({ message: error.message, errorToReport: error });
  });

  reporting.setTag('team_id', team.id);

  // ONE segment, carrying two named fields. See ../../render/teamCreated.
  emit({ kind: 'team-created', team });
}

export default teamCreate;

/* ========================================================================== */

function resolveName(passedName: string | undefined): string {
  const name = passedName?.trim();

  if (!name) {
    throwError({
      message:
        `\`sherlo ${THIS_COMMAND}\` needs a name for the team, e.g.\n` +
        `  \`sherlo ${THIS_COMMAND} --${NAME_OPTION} "Acme"\`.`,
    });
  }

  if (name.length > MAX_TEAM_NAME_LENGTH) {
    throwError({
      message:
        `A team name may be at most ${MAX_TEAM_NAME_LENGTH} characters; this one is ` +
        `${name.length}.`,
    });
  }

  return name;
}

/**
 * What the CLI says when the backend refuses the token.
 *
 * Unlike ../projectCreate/projectCreate's version, there is no team to name
 * here: creating a team has nothing to check the caller's role against, so
 * the possibilities are narrower.
 */
function refuseRejectedToken(): never {
  throwError({
    type: 'auth',
    message:
      'The API refused this personal token.\n' +
      '\n' +
      '  It does not say which of these it is, so check them in this order:\n' +
      '    - the token is revoked or expired (the web app lists both);\n' +
      '    - it was minted without the `team:write` scope;\n' +
      '    - the token was mistyped or truncated in transit.',
  });
}
