/**
 * `sherlo project list --team <teamId>` - the read-side sibling of
 * `project create`. Same credential (a PERSONAL token), same `--team` flag,
 * reused wholesale from ../shared rather than re-resolved here - see
 * ../projectCreate/projectCreate for why `--personal-token` and `--team` are
 * shaped the way they are.
 */
import { NAME_OPTION, PERSONAL_TOKEN_OPTION, TEAM_OPTION } from '../../constants';
import { printSherloIntro, reporting, throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { resolvePersonalToken, resolveTeamId } from '../shared';
import listProjectsRequest, { ListProjectsAuthError } from './listProjectsRequest';
import { THIS_COMMAND } from './constants';

export type ProjectListOptions = {
  [TEAM_OPTION]?: string;
  [PERSONAL_TOKEN_OPTION]?: string;
};

async function projectList(passedOptions: ProjectListOptions): Promise<void> {
  printSherloIntro();

  const teamId = resolveTeamId(passedOptions[TEAM_OPTION], {
    thisCommand: THIS_COMMAND,
    purpose: 'the team whose projects to list',
  });
  const personalToken = resolvePersonalToken(passedOptions[PERSONAL_TOKEN_OPTION], {
    thisCommand: THIS_COMMAND,
    tokenContextLine: 'that one names a single project, and this command lists a whole team.',
  });

  reporting.setTag('team_id', teamId);

  const list = await listProjectsRequest({ teamId, personalToken }).catch((error: Error) => {
    if (error instanceof ListProjectsAuthError) refuseRejectedToken(teamId);

    throwError({ message: error.message, errorToReport: error });
  });

  emit({ kind: 'project-list', list });
}

export default projectList;

/* ========================================================================== */

/**
 * What the CLI says when the backend refuses the token.
 *
 * NOT "you are not a member of that team, or the team id is wrong" - unlike
 * ../projectCreate/projectCreate's version, that possibility is already ruled
 * out by the time this fires: `listProjectsRequest` looks `teamId` up in the
 * caller's own `listTeams` result FIRST and refuses with its own, more
 * specific message when it isn't there (see that module's header). Reaching
 * an auth refusal means the token itself is the problem - and since this
 * command makes TWO calls, either operation's scope can be the missing one.
 */
function refuseRejectedToken(teamId: string): never {
  throwError({
    type: 'auth',
    message:
      `The API refused this personal token for team \`${teamId}\`.\n` +
      '\n' +
      '  It does not say which of these it is, so check them in this order:\n' +
      '    - the token is revoked or expired (the web app lists both);\n' +
      "    - it was minted without the `project:read` scope (lists the team's\n" +
      '      projects) or the `team:read` scope (looks the team up by id);\n' +
      '    - the token was mistyped or truncated in transit.\n' +
      '\n' +
      '  Find the team id with `sherlo team list`, or by creating a project first:\n' +
      `  \`sherlo project create --${NAME_OPTION} <name> --${TEAM_OPTION} <teamId>\`.`,
  });
}
