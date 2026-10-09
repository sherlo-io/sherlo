/**
 * `sherlo team create --name <name>` - the read-free sibling of
 * `project create`: same credential (the saved login), no `--team` flag,
 * because there is no team yet to name.
 */
import { MAX_TEAM_NAME_LENGTH, NAME_OPTION } from '../../constants';
import { printSherloIntro, reporting, throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { refuseRejectedLogin, resolveLogin } from '../shared';
import { CreateTeamAuthError } from './createTeamRequest';
import { serverCalls } from '../../seams/serverCalls';
import { THIS_COMMAND } from './constants';

export type TeamCreateOptions = {
  [NAME_OPTION]?: string;
};

async function teamCreate(passedOptions: TeamCreateOptions): Promise<void> {
  printSherloIntro();

  const name = resolveName(passedOptions[NAME_OPTION]);
  const login = resolveLogin(THIS_COMMAND);

  const team = await serverCalls()
    .createTeam({ name, personalToken: login.token })
    .catch((error: Error) => {
      if (error instanceof CreateTeamAuthError) refuseRejectedLogin();

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
        `\`npx sherlo ${THIS_COMMAND}\` needs a name for the team, e.g.\n` +
        `  \`npx sherlo ${THIS_COMMAND} --${NAME_OPTION} "Acme"\`.`,
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
