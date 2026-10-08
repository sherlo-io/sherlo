/**
 * THE CREDENTIAL A PUSH SPENDS, AND THE PROJECT IT GOES TO (sherlo / The credential and the
 * project of a push). `sherlo test`, `sherlo view` and `sherlo test:eas-cloud-build` resolve it
 * here, once, and every refusal of it happens here, before any request.
 *
 * The first of four is spent, in this order:
 *
 *     1. `--token`                  \
 *     2. SHERLO_TOKEN                > a project token: the project is the one the token names
 *     3. `token` in the config      /
 *     4. the saved login            - a person's credential: the project is the config's `project`
 *
 * A token given on purpose always beats the login, so a CI job never depends on who is logged in
 * on its machine. An empty SHERLO_TOKEN counts as unset, because GitHub turns a missing secret
 * into an empty string. The EAS opener takes a project token only, because its token travels to
 * Expo's build machine. No flag and no variable carries a personal token: the login is the only
 * person's credential a push takes.
 */
import { TEAM_ID_LENGTH } from '@sherlo/shared';
import { DOCS_LINK, TEST_EAS_CLOUD_BUILD_COMMAND, TOKEN_OPTION } from '../../../constants';
import { LOGIN_COMMAND } from '../../../commands/login/constants';
import { savedLogins } from '../../../seams/savedLogins';
import { InvalidatedConfig, PushCredential } from '../../../types';
import { getEndpointUrl } from '../../buildStatusRequest';
import getTokenParts from '../../getTokenParts';
import isPersonalToken from '../../isPersonalToken';
import isValidToken from '../../isValidToken';
import refuseIfPersonalToken from '../../refuseIfPersonalToken';
import throwError from '../../throwError';

/** The variable CI keeps the project token in. */
const PROJECT_TOKEN_ENV_VAR = 'SHERLO_TOKEN';

/** The credential flag a command was given, as commander parsed it. */
type CredentialFlags = { [TOKEN_OPTION]?: string };

function resolvePushCredential(
  command: string,
  flags: CredentialFlags,
  config: InvalidatedConfig
): PushCredential {
  const projectToken = findProjectToken(flags, config);

  if (projectToken !== undefined) {
    return spendProjectToken(projectToken, config);
  }

  const savedLogin = savedLogins().read(getEndpointUrl());

  if (!savedLogin) refuseNoCredential();

  if (command === TEST_EAS_CLOUD_BUILD_COMMAND) refuseOnEas();

  if (config.project === undefined) refuseNoProject();

  const { teamId, projectIndex } = parseConfigProject(config.project);

  return {
    kind: 'person',
    token: savedLogin.token,
    teamId,
    projectIndex,
    fromSavedLogin: true,
  };
}

export default resolvePushCredential;

/* ========================================================================== */
/* A project token                                                            */
/* ========================================================================== */

/**
 * `--token`, then SHERLO_TOKEN, then the config's `token`, checked for its shape as it is found.
 * A blank `--token` or config `token` was given on purpose, so it is refused as a made-up token,
 * never skipped; only a blank SHERLO_TOKEN counts as unset.
 */
function findProjectToken(flags: CredentialFlags, config: InvalidatedConfig): string | undefined {
  const tokenFlag = flags[TOKEN_OPTION];
  if (tokenFlag !== undefined) {
    refuseIfPersonalToken(tokenFlag);
    return tokenFlag;
  }

  const tokenVariable = process.env[PROJECT_TOKEN_ENV_VAR];
  if (tokenVariable?.trim()) {
    if (isPersonalToken(tokenVariable)) refusePersonalTokenInProjectTokenVariable();
    return tokenVariable;
  }

  // The config file is JSON a person wrote, so its `token` may be anything at all.
  const configToken: unknown = config.token;
  if (configToken === undefined) return undefined;

  if (typeof configToken !== 'string') {
    throwError({
      message: 'Property `token` must be a string',
      learnMoreLink: DOCS_LINK.configToken,
    });
  }

  refuseIfPersonalToken(configToken);
  return configToken;
}

/** The project token's three parts, after its layout and the config's `project` are checked. */
function spendProjectToken(projectToken: string, config: InvalidatedConfig): PushCredential {
  if (!isValidToken(projectToken)) {
    throwError({
      message:
        'Invalid `token` value. Make sure you copied it correctly or generate a new one in Sherlo web app',
      learnMoreLink: DOCS_LINK.configToken,
    });
  }

  const { apiToken, teamId, projectIndex } = getTokenParts(projectToken);

  // A push on a project token goes to the project the token names. A config that names another
  // one is refused rather than resolved: the push would land in a project the config does not name.
  if (config.project !== undefined) {
    const configProject = parseConfigProject(config.project);

    if (configProject.teamId !== teamId || configProject.projectIndex !== projectIndex) {
      refuseTokenProjectMismatch();
    }
  }

  return {
    kind: 'projectToken',
    token: projectToken,
    apiToken,
    teamId,
    projectIndex,
    fromSavedLogin: false,
  };
}

/* ========================================================================== */
/* The config's `project`                                                     */
/* ========================================================================== */

/** The team id, a slash and the project's number, such as `k3j9x2ab/4`. */
const CONFIG_PROJECT_SHAPE = new RegExp(`^([^/\\s]{${TEAM_ID_LENGTH}})/([1-9][0-9]*)$`);

/**
 * The team and project the config's `project` names. The config file is JSON a person wrote, so
 * its `project` may be anything at all.
 */
export function parseConfigProject(configProject: unknown): {
  teamId: string;
  projectIndex: number;
} {
  const match = typeof configProject === 'string' ? CONFIG_PROJECT_SHAPE.exec(configProject) : null;

  if (!match) refuseMalformedProject(configProject);

  return { teamId: match[1], projectIndex: Number(match[2]) };
}

/* ========================================================================== */
/* The refusals                                                               */
/* ========================================================================== */

function refuseNoCredential(): never {
  throwError({
    type: 'auth',
    message:
      'There is no credential to push with.\n' +
      `  On your own computer, run \`npx sherlo ${LOGIN_COMMAND}\`.\n` +
      `  In CI, set the project token as ${PROJECT_TOKEN_ENV_VAR}.`,
  });
}

function refuseOnEas(): never {
  throwError({
    type: 'auth',
    message:
      `\`npx sherlo ${TEST_EAS_CLOUD_BUILD_COMMAND}\` takes a project token only, and found ` +
      'your login.\n' +
      "  Its token travels to Expo's build machine, so a person's login is never sent there.\n" +
      `  Set the project token as ${PROJECT_TOKEN_ENV_VAR}.`,
  });
}

function refuseNoProject(): never {
  throwError({
    message:
      'sherlo.config.json names no project, so your login has nowhere to push.\n' +
      '  Run `npx sherlo init` to choose one. It writes `project` into the config.',
  });
}

function refuseMalformedProject(configProject: unknown): never {
  const shownValue =
    typeof configProject === 'string' ? configProject : JSON.stringify(configProject);

  throwError({
    message:
      `The \`project\` in sherlo.config.json is \`${shownValue}\`, which is not a team id, a slash and a project number.\n` +
      '  It looks like `k3j9x2ab/4`. Run `npx sherlo init` to write it.',
  });
}

/** Never prints the token: it is a live credential. */
function refuseTokenProjectMismatch(): never {
  throwError({
    type: 'auth',
    message:
      `${PROJECT_TOKEN_ENV_VAR} or \`--${TOKEN_OPTION}\` names a different project than \`project\` in sherlo.config.json.\n` +
      '  This push would land in a project the config does not name.\n' +
      "  Make them agree: use that project's token, or change `project` in the config.",
  });
}

/** Never prints the token: it is a live credential somebody put in the wrong variable. */
function refusePersonalTokenInProjectTokenVariable(): never {
  throwError({
    type: 'auth',
    message:
      `${PROJECT_TOKEN_ENV_VAR} wants a project token, and this is a personal token.\n` +
      `  CI holds the project token for ${PROJECT_TOKEN_ENV_VAR}. Copy it from the project's settings in the Sherlo web app.\n` +
      `  To act as yourself, run \`npx sherlo ${LOGIN_COMMAND}\` instead.`,
  });
}
