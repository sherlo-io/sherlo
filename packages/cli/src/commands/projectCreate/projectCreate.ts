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
 * THE NICE VERSION IS `sherlo team list`, printing the id next to each team
 * name so a human can copy one, and it should be the next management command
 * built. It needs one api operation opened to a personal token (a `teams:read`
 * scope, listing the owner's memberships) and it is NOT built here - this
 * command would not use it anyway; the flag is what it would help someone fill
 * in.
 */
import {
  MAX_PROJECT_NAME_LENGTH,
  NAME_OPTION,
  PERSONAL_TOKEN_ENV_VAR,
  PERSONAL_TOKEN_FLAG,
  PERSONAL_TOKEN_OPTION,
  PERSONAL_TOKEN_PREFIX,
  TEAM_OPTION,
  TOKEN_OPTION,
} from '../../constants';
import { isPersonalToken, printSherloIntro, reporting, throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
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
  const teamId = resolveTeamId(passedOptions[TEAM_OPTION]);
  const personalToken = resolvePersonalToken(passedOptions[PERSONAL_TOKEN_OPTION]);

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

function resolveTeamId(passedTeamId: string | undefined): string {
  const teamId = passedTeamId?.trim();

  if (!teamId) {
    throwError({
      message:
        `\`sherlo ${THIS_COMMAND}\` needs the team the project belongs to: ` +
        `\`--${TEAM_OPTION} <teamId>\`.\n` +
        '\n' +
        '  A personal token names a person, not a team, so there is nothing to infer it\n' +
        "  from. The id is the `t=` value in the web app's URL while you are looking at\n" +
        '  that team.',
    });
  }

  return teamId;
}

/**
 * The personal token, from the flag or the environment, refusing anything that
 * is not one BEFORE it is sent anywhere.
 */
function resolvePersonalToken(passedToken: string | undefined): string {
  const personalToken = (passedToken ?? process.env[PERSONAL_TOKEN_ENV_VAR])?.trim();

  if (!personalToken) {
    throwError({
      type: 'auth',
      message:
        `\`sherlo ${THIS_COMMAND}\` needs a personal token: ` +
        `\`--${PERSONAL_TOKEN_FLAG} <token>\` or ${PERSONAL_TOKEN_ENV_VAR}.\n` +
        '\n' +
        '  Mint one in the Sherlo web app - the CLI cannot mint tokens, by design.\n' +
        `  This is NOT the project token from \`--${TOKEN_OPTION}\` / sherlo.config.json:\n` +
        '  that one names a project, and the project does not exist yet.',
    });
  }

  if (!isPersonalToken(personalToken)) {
    throwError({
      type: 'auth',
      message:
        `\`--${PERSONAL_TOKEN_FLAG}\` wants a personal token, and this is not one - a ` +
        `personal\n  token starts with \`${PERSONAL_TOKEN_PREFIX}\`.\n` +
        '\n' +
        '  If you pasted your project token: that one names an existing project and\n' +
        '  cannot create a new one. Mint a personal token in the Sherlo web app.',
    });
  }

  return personalToken;
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
      '    - it was minted without the `projects:write` scope;\n' +
      '    - you are not a member of that team, or the team id is wrong;\n' +
      '    - the token was mistyped or truncated in transit.',
  });
}
