/**
 * THE CREDENTIAL A PUSH SPENDS, AND THE PROJECT IT GOES TO. `sherlo test`, `sherlo view` and
 * `sherlo test:eas-cloud-build` resolve it here, once, and every refusal of it happens here,
 * before any request.
 *
 * The first of three is spent, in this order:
 *
 *     1. SHERLO_TOKEN      - a project token: the project is the one the token names
 *     2. GitHub's ID token - on GitHub Actions only, traded for a session: the project is the
 *                            config's `project`
 *     3. the saved login   - a person's credential: the project is the config's `project`
 *
 * The project token always beats the rest, so a CI job never depends on who is logged in on its
 * machine. An empty SHERLO_TOKEN counts as unset, because GitHub turns a missing secret into an
 * empty string. The EAS opener takes a project token only, because its token travels to Expo's
 * build machine. No variable carries a personal token: the login is the only person's credential a
 * push takes.
 *
 * Sherlo 2 also took `--token` and a `token` in the config. The flag is refused before the command
 * runs (refuseTokenFlag in ../../../start), and again here for a caller that reaches this resolver
 * another way; the config key is refused here, in the same words, before anything is read off it
 * - a credential ignored in silence would push somewhere its author
 * did not mean.
 */
import { TEAM_ID_LENGTH } from '@sherlo/shared';
import { DOCS_LINK, TEST_EAS_CLOUD_BUILD_COMMAND } from '../../../constants';
import { LOGIN_COMMAND } from '../../../commands/login/constants';
import {
  renderNoGitHubIdToken,
  renderRepositoryNotConnected,
  renderTokenGone,
} from '../../../render/pushCredential';
import { emit } from '../../transcriptSink';
import { serverCalls } from '../../../seams/serverCalls';
import { savedLogins } from '../../../seams/savedLogins';
import { InvalidatedConfig, PushCredential } from '../../../types';
import { getEndpointUrl } from '../../buildStatusRequest';
import getTokenParts from '../../getTokenParts';
import isPersonalToken from '../../isPersonalToken';
import isValidToken from '../../isValidToken';
import throwError from '../../throwError';

/** The variable CI keeps the project token in. */
const PROJECT_TOKEN_ENV_VAR = 'SHERLO_TOKEN';

async function resolvePushCredential(
  command: string,
  config: InvalidatedConfig,
  passedOptions: object = {}
): Promise<PushCredential> {
  // `--token` and the config's `token` are both refused, never read. The option and the config key
  // are in no type, and the config file is JSON a person wrote, so its `token` may be anything.
  const givenToken = (passedOptions as { token?: unknown }).token;
  const configToken = (config as { token?: unknown }).token;
  if (givenToken !== undefined || configToken !== undefined) {
    throwError(renderTokenGone(command));
  }

  const projectToken = process.env[PROJECT_TOKEN_ENV_VAR];

  if (projectToken?.trim()) {
    return spendProjectToken(projectToken, config);
  }

  // The second credential: GitHub's ID token, only inside GitHub Actions. A job that was not
  // granted `id-token: write` has no ACTIONS_ID_TOKEN_REQUEST_URL and is refused there.
  if (process.env.GITHUB_ACTIONS === 'true') {
    return spendGitHubIdToken(config);
  }

  const savedLogin = savedLogins().read(getEndpointUrl());

  if (!savedLogin) refuseNoCredential();

  if (command === TEST_EAS_CLOUD_BUILD_COMMAND) refuseOnEas();

  if (config.project === undefined) refuseNoProject();

  const { teamId, projectIndex } = parseConfigProject(config.project);

  return { kind: 'person', token: savedLogin.token, teamId, projectIndex };
}

export default resolvePushCredential;

/**
 * GitHub's ID token, traded with the service once for a session on the config's project. The
 * session is the credential for every call the run makes.
 */
async function spendGitHubIdToken(config: InvalidatedConfig): Promise<PushCredential> {
  const repository = process.env.GITHUB_REPOSITORY ?? '';

  if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    throwError(renderNoGitHubIdToken());
  }

  if (config.project === undefined) refuseNoProject();
  const { teamId, projectIndex } = parseConfigProject(config.project);

  const trade = await serverCalls().tradeGitHubIdToken({ repository, teamId });

  if (trade.status === 'not-connected') {
    throwError(renderRepositoryNotConnected(repository, trade.teamName));
  }

  emit({ kind: 'signed-in-through-github', repository });

  return { kind: 'github-session', token: trade.token, teamId, projectIndex, repository };
}

/* ========================================================================== */
/* A project token                                                            */
/* ========================================================================== */

/** The project token's three parts, after its kind, its layout and the config's `project` are checked. */
function spendProjectToken(projectToken: string, config: InvalidatedConfig): PushCredential {
  if (isPersonalToken(projectToken)) refusePersonalTokenInProjectTokenVariable();

  if (!isValidToken(projectToken)) {
    throwError({
      message: `Invalid ${PROJECT_TOKEN_ENV_VAR} value. Make sure you copied it correctly or generate a new one in the Sherlo web app.`,
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

  return { kind: 'projectToken', token: projectToken, apiToken, teamId, projectIndex };
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
    message:
      'No token or login found to run the test with.\n' +
      `  On your own computer, run \`npx sherlo ${LOGIN_COMMAND}\`.\n` +
      `  In CI, set the project token as ${PROJECT_TOKEN_ENV_VAR}.`,
  });
}

function refuseOnEas(): never {
  throwError({
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
      'sherlo.config.json names no project, so your login has no project to test against.\n' +
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
    message:
      `${PROJECT_TOKEN_ENV_VAR} names a different project than \`project\` in sherlo.config.json.\n` +
      '  This push would land in a project the config does not name.\n' +
      "  Make them agree: use that project's token, or change `project` in the config.",
  });
}

/** Never prints the token: it is a live credential somebody put in the wrong variable. */
function refusePersonalTokenInProjectTokenVariable(): never {
  throwError({
    message:
      `${PROJECT_TOKEN_ENV_VAR} wants a project token, and this is a personal token.\n` +
      `  CI holds the project token for ${PROJECT_TOKEN_ENV_VAR}. Copy it from the project's settings in the Sherlo web app.\n` +
      `  To act as yourself, run \`npx sherlo ${LOGIN_COMMAND}\` instead.`,
  });
}
