/**
 * `sherlo project create --name <name> --team <teamId>` - the CLI's first MANAGEMENT
 * command, and the first thing a PERSONAL token can drive.
 *
 * See ../../constants (the COMMANDS block) for why this one is noun-verb while
 * `test` / `view` / `init` are bare verbs.
 *
 * ------------------------------------------------------------------------
 * WHERE THE CREDENTIAL COMES FROM, AND WHY IT IS NOT `--token`.
 *
 * `--personal-token`, or SHERLO_PERSONAL_TOKEN. Not the config file, and NOT
 * `SHERLO_TOKEN`.
 *
 * The three roads were a flag, an env var and the config file, and the config
 * file is the one to rule out first: `sherlo.config.json` is committed, it
 * belongs to a project, and this command runs where no project exists yet. A
 * personal credential in a committed file is also just a bad idea.
 *
 * Between the flag and the env var, both ship - they are the same two roads
 * `--token` already offers, and a management command run from a script wants
 * the env var while one run by hand wants the flag. What does NOT ship is
 * reusing `SHERLO_TOKEN`: it means the project token today, in every customer's
 * CI, and a variable that holds a credential of a different reach depending on
 * which command reads it is how a person ends up pasting the wrong one into a
 * pipeline. The whole point of the `sht_` prefix is that these two are
 * distinguishable, so the CLI keeps them distinguishable all the way up to the
 * name of the flag.
 *
 * WHAT HAPPENS ON THE WRONG ONE. Both directions are refused locally, by name,
 * before any request: a personal token given to `--token` is caught by
 * helpers/refuseIfPersonalToken (reached from every project-token path,
 * including the parser itself), and a project token given to
 * `--personal-token` is caught below by the absent prefix.
 *
 * ------------------------------------------------------------------------
 * WHY `--team` IS A FLAG AND WHY THAT IS THE HONEST ANSWER FOR NOW.
 *
 * A project belongs to exactly one team, the api demands the id, and a personal
 * token belongs to a person who may be in several teams - so there is nothing
 * for the CLI to default to. Three options were on the table: ask
 * interactively (dead in CI, which is where this command will mostly run),
 * infer from the token (impossible - a personal token names a person, not a
 * team, which is the entire design), or take a flag. So: a flag.
 *
 * THE NICE VERSION IS `sherlo team list` (../teamList), printing the id next to
 * each team name so a human can copy one. This command does not call it - the
 * flag is what it would help someone fill in - and it is what most people will
 * still run first, so the flag stays required rather than becoming optional
 * now that the lookup exists.
 */
import {
  MAX_PROJECT_NAME_LENGTH,
  NAME_OPTION,
  PERSONAL_TOKEN_OPTION,
  TEAM_OPTION,
} from '../../constants';
import { printSherloIntro, reporting, throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { resolvePersonalToken, resolveTeamId } from '../shared';
import createProjectRequest, { CreateProjectAuthError } from './createProjectRequest';
import { THIS_COMMAND } from './constants';

export type ProjectCreateOptions = {
  [NAME_OPTION]?: string;
  [TEAM_OPTION]?: string;
  [PERSONAL_TOKEN_OPTION]?: string;
};

async function projectCreate(passedOptions: ProjectCreateOptions): Promise<void> {
  printSherloIntro();

  const name = resolveName(passedOptions[NAME_OPTION]);
  const teamId = resolveTeamId(passedOptions[TEAM_OPTION], {
    thisCommand: THIS_COMMAND,
    purpose: 'the team the project belongs to',
  });
  const personalToken = resolvePersonalToken(passedOptions[PERSONAL_TOKEN_OPTION], {
    thisCommand: THIS_COMMAND,
    tokenContextLine: 'that one names a project, and the project does not exist yet.',
  });

  // The team is the one fact here worth having on a crash report. The token is
  // not, in any form: no hash, no prefix, no length.
  reporting.setTag('team_id', teamId);

  const project = await createProjectRequest({ name, teamId, personalToken }).catch(
    (error: Error) => {
      if (error instanceof CreateProjectAuthError) refuseRejectedToken(teamId);

      throwError({ message: error.message, errorToReport: error });
    }
  );

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
        `\`sherlo ${THIS_COMMAND}\` needs a name for the project, e.g.\n` +
        `  \`sherlo ${THIS_COMMAND} --${NAME_OPTION} "Design System" --${TEAM_OPTION} <teamId>\`.`,
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

/**
 * What the CLI says when the backend refuses the token.
 *
 * IT LISTS THE POSSIBILITIES INSTEAD OF NAMING ONE, because the api genuinely
 * does not tell it which: the personal-token authorizer answers a bare no to an
 * unknown token, a revoked one, an expired one, one without the scope, and one
 * whose owner is not a member of this team - deliberately, so a rejected
 * credential cannot be probed for facts. Inventing a specific cause here would
 * be a guess printed as a diagnosis.
 */
function refuseRejectedToken(teamId: string): never {
  throwError({
    type: 'auth',
    message:
      `The API refused this personal token for team \`${teamId}\`.\n` +
      '\n' +
      '  It does not say which of these it is, so check them in this order:\n' +
      '    - the token is revoked or expired (the web app lists both);\n' +
      '    - it was minted without the `project:write` scope;\n' +
      '    - you are not a member of that team, or the team id is wrong;\n' +
      '    - the token was mistyped or truncated in transit.',
  });
}
