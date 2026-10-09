/**
 * `sherlo project create --name <name> --team <teamId>` - the CLI's first MANAGEMENT
 * command.
 *
 * See ../../constants (the COMMANDS block) for why this one is noun-verb while
 * `test` / `view` / `init` are bare verbs.
 *
 * ------------------------------------------------------------------------
 * WHERE THE CREDENTIAL COMES FROM, AND WHY IT IS NOT `--token`.
 *
 * The saved login, and nothing else (sherlo / Teams, projects and the personal token). Not the
 * config file, and NOT `--token` or `SHERLO_TOKEN`: those mean the project token, in every
 * customer's CI, and this command runs where no project exists yet. A personal token given to
 * `--token` is refused locally, by name, before any request (helpers/refuseIfPersonalToken).
 *
 * ------------------------------------------------------------------------
 * WHY `--team` IS A FLAG AND WHY THAT IS THE HONEST ANSWER FOR NOW.
 *
 * A project belongs to exactly one team, the api demands the id, and a login
 * belongs to a person who may be in several teams - so there is nothing for
 * the CLI to default to. Three options were on the table: ask interactively
 * (dead in a script), infer from the login (impossible - a login names a
 * person, not a team), or take a flag. So: a flag.
 *
 * THE NICE VERSION IS `sherlo team list` (../teamList), printing the id next to
 * each team name so a human can copy one. This command does not call it - the
 * flag is what it would help someone fill in - and it is what most people will
 * still run first, so the flag stays required rather than becoming optional
 * now that the lookup exists.
 */
import { MAX_PROJECT_NAME_LENGTH, NAME_OPTION, TEAM_OPTION } from '../../constants';
import { printSherloIntro, reporting, throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { refuseRejectedLogin, resolveLogin, resolveTeamId } from '../shared';
import { CreateProjectAuthError } from './createProjectRequest';
import { serverCalls } from '../../seams/serverCalls';
import { THIS_COMMAND } from './constants';

export type ProjectCreateOptions = {
  [NAME_OPTION]?: string;
  [TEAM_OPTION]?: string;
};

async function projectCreate(passedOptions: ProjectCreateOptions): Promise<void> {
  printSherloIntro();

  const name = resolveName(passedOptions[NAME_OPTION]);
  const teamId = resolveTeamId(passedOptions[TEAM_OPTION], {
    thisCommand: THIS_COMMAND,
    purpose: 'the team the project belongs to',
  });
  const login = resolveLogin(THIS_COMMAND);

  // The team is the one fact here worth having on a crash report. The token is
  // not, in any form: no hash, no prefix, no length.
  reporting.setTag('team_id', teamId);

  const project = await serverCalls()
    .createProject({ name, teamId, personalToken: login.token })
    .catch((error: Error) => {
      if (error instanceof CreateProjectAuthError) refuseRejectedLogin();

      throwError({ message: error.message, errorToReport: error });
    });

  // ONE segment, carrying three named fields - never the response. See
  // ../../render/projectCreated for why that distinction is the point.
  emit({ kind: 'project-created', project });
}

export default projectCreate;

/* ========================================================================== */

function resolveName(passedName: string | undefined): string {
  const name = passedName?.trim();

  if (!name) {
    throwError({
      message:
        `\`npx sherlo ${THIS_COMMAND}\` needs a name for the project, e.g.\n` +
        `  \`npx sherlo ${THIS_COMMAND} --${NAME_OPTION} "Design System" --${TEAM_OPTION} <teamId>\`.`,
    });
  }

  if (name.length > MAX_PROJECT_NAME_LENGTH) {
    throwError({
      message:
        `A project name may be at most ${MAX_PROJECT_NAME_LENGTH} characters; this one is ` +
        `${name.length}.`,
    });
  }

  return name;
}
