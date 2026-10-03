/**
 * THE CREDENTIAL A PUSH SPENDS, AND THE PROJECT IT GOES TO (sherlo / The credential and the
 * project of a push). `sherlo test`, `sherlo view` and `sherlo test:eas-cloud-build` resolve it
 * here, once, and every refusal of it happens here, before any request.
 *
 * The first of six is spent, in this order:
 *
 *     1. `--token`                  \
 *     2. SHERLO_TOKEN                > a project token: the project is the one the token names
 *     3. `token` in the config      /
 *     4. `--personal-token`         \
 *     5. SHERLO_PERSONAL_TOKEN       > a person's credential: the project is the config's `project`
 *     6. the saved login            /
 *
 * A token given on purpose always beats the login, so a CI job never depends on who is logged in
 * on its machine. An empty SHERLO_TOKEN counts as unset, because GitHub turns a missing secret
 * into an empty string. The EAS opener takes a project token only, because its token travels to
 * Expo's build machine. A person's credential must be shaped like a personal token, whichever of
 * the three it came from, or it is refused before it is sent.
 */
import { TEAM_ID_LENGTH } from '@sherlo/shared';
import {
  DOCS_LINK,
  PERSONAL_TOKEN_ENV_VAR,
  PERSONAL_TOKEN_FLAG,
  PERSONAL_TOKEN_OPTION,
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TOKEN_OPTION,
} from '../../../constants';
import { savedLogins } from '../../../seams/savedLogins';
import { InvalidatedConfig, PushCredential } from '../../../types';
import { getEndpointUrl } from '../../buildStatusRequest';
import getTokenParts from '../../getTokenParts';
import isPersonalToken from '../../isPersonalToken';
import isValidToken from '../../isValidToken';
import refuseIfNotPersonalToken from '../../refuseIfNotPersonalToken';
import refuseIfPersonalToken from '../../refuseIfPersonalToken';
import throwError from '../../throwError';

/** The variable CI keeps the project token in. */
const PROJECT_TOKEN_ENV_VAR = 'SHERLO_TOKEN';

/** The two credential flags a command was given, as commander parsed them. */
type CredentialFlags = { [TOKEN_OPTION]?: string; [PERSONAL_TOKEN_OPTION]?: string };

function resolvePushCredential(
  command: string,
  flags: CredentialFlags,
  config: InvalidatedConfig
): PushCredential {
  const projectToken = findProjectToken(flags, config);

  if (projectToken !== undefined) {
    return spendProjectToken(projectToken, config);
  }

  const personCredential = findPersonCredential(flags);

  if (!personCredential) refuseNoCredential();

  // Checked before anything else about it, as every management command checks it: a project token
  // given where a personal token belongs must never be sent as somebody's login.
  refuseIfNotPersonalToken(personCredential.token);

  if (command === TEST_EAS_CLOUD_BUILD_COMMAND) refuseOnEas(personCredential.name);

  if (config.project === undefined) refuseNoProject(personCredential.name);

  const { teamId, projectIndex } = parseConfigProject(config.project);

  return {
    kind: 'person',
    token: personCredential.token,
    teamId,
    projectIndex,
    fromSavedLogin: personCredential.fromSavedLogin,
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
/* A person's credential                                                      */
/* ========================================================================== */

/** A person's credential, said the way a refusal names it. */
type PersonCredentialName =
  | `\`--${typeof PERSONAL_TOKEN_FLAG}\``
  | typeof PERSONAL_TOKEN_ENV_VAR
  | 'your login';

/**
 * `--personal-token`, then SHERLO_PERSONAL_TOKEN, then the login saved for the service address
 * this run talks to - read the way ../../../commands/shared/resolvePersonalToken reads them.
 */
function findPersonCredential(
  flags: CredentialFlags
): { token: string; name: PersonCredentialName; fromSavedLogin: boolean } | undefined {
  const personalTokenFlag = flags[PERSONAL_TOKEN_OPTION]?.trim();
  if (personalTokenFlag) {
    return {
      token: personalTokenFlag,
      name: `\`--${PERSONAL_TOKEN_FLAG}\``,
      fromSavedLogin: false,
    };
  }

  const personalTokenVariable = process.env[PERSONAL_TOKEN_ENV_VAR]?.trim();
  if (personalTokenVariable) {
    return { token: personalTokenVariable, name: PERSONAL_TOKEN_ENV_VAR, fromSavedLogin: false };
  }

  const savedLogin = savedLogins().read(getEndpointUrl());
  if (savedLogin) return { token: savedLogin.token, name: 'your login', fromSavedLogin: true };

  return undefined;
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
      '  On your own computer, run `sherlo login`.\n' +
      `  In CI, set the project token as ${PROJECT_TOKEN_ENV_VAR}.`,
  });
}

function refuseOnEas(credentialName: PersonCredentialName): never {
  throwError({
    type: 'auth',
    message:
      `\`sherlo ${TEST_EAS_CLOUD_BUILD_COMMAND}\` takes a project token only, and found ` +
      `${credentialName}.\n` +
      "  Its token travels to Expo's build machine, so a person's login is never sent there.\n" +
      `  Set the project token as ${PROJECT_TOKEN_ENV_VAR}.`,
  });
}

function refuseNoProject(credentialName: PersonCredentialName): never {
  throwError({
    message:
      `sherlo.config.json names no project, so ${credentialName} has nowhere to push.\n` +
      '  Run `sherlo init` to choose one. It writes `project` into the config.',
  });
}

function refuseMalformedProject(configProject: unknown): never {
  const shownValue =
    typeof configProject === 'string' ? configProject : JSON.stringify(configProject);

  throwError({
    message:
      `The \`project\` in sherlo.config.json is \`${shownValue}\`, which is not a team id, a slash and a project number.\n` +
      '  It looks like `k3j9x2ab/4`. Run `sherlo init` to write it.',
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
      `  A personal token goes in ${PERSONAL_TOKEN_ENV_VAR}.`,
  });
}
