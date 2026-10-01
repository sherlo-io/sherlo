/**
 * A PUSH WITH NO PROJECT TOKEN - what is refused before any request (sherlo / The credential and
 * the project of a push).
 *
 * A push spends a project token first, then a person's credential: a personal token, then the
 * saved login. This module answers the case where no project token was given, and says what is
 * wrong with what is left:
 *
 *     nothing at all                       -> names `sherlo login`, and SHERLO_TOKEN for CI
 *     a person's credential, on EAS        -> the EAS road takes a project token only
 *     a person's credential, no `project`  -> names `sherlo init`
 *
 * ------------------------------------------------------------------------
 * PLAN STAND-IN (epic cli-login). Spending a person's credential on a push - choosing it, and
 * pushing into the config's `project` with it - is a build task, as is reading SHERLO_TOKEN and
 * `--personal-token` here. Until it lands, a push that has a person's credential AND a project is
 * refused by {@link refusePushOnPersonCredentialNotBuilt}, naming itself.
 */
import { PERSONAL_TOKEN_ENV_VAR, TEST_EAS_CLOUD_BUILD_COMMAND } from '../../../constants';
import { savedLogins } from '../../../seams/savedLogins';
import { getEndpointUrl } from '../../buildStatusRequest';
import throwError from '../../throwError';

/** The variable CI keeps the project token in. */
const PROJECT_TOKEN_ENV_VAR = 'SHERLO_TOKEN';

/** A person's credential a push found, said the way a refusal names it. */
type PersonCredential = 'your login' | typeof PERSONAL_TOKEN_ENV_VAR;

function refuseWithoutProjectToken(command: string, config: { project?: unknown }): never {
  const personCredential = findPersonCredential();

  if (!personCredential) refuseNoCredential();

  if (command === TEST_EAS_CLOUD_BUILD_COMMAND) refuseOnEas(personCredential);

  if (config.project === undefined) refuseNoProject(personCredential);

  refusePushOnPersonCredentialNotBuilt();
}

export default refuseWithoutProjectToken;

/* ========================================================================== */

/** SHERLO_PERSONAL_TOKEN, then the login saved for the service address this run talks to. */
function findPersonCredential(): PersonCredential | undefined {
  if (process.env[PERSONAL_TOKEN_ENV_VAR]?.trim()) return PERSONAL_TOKEN_ENV_VAR;
  if (savedLogins().read(getEndpointUrl())) return 'your login';
  return undefined;
}

function refuseNoCredential(): never {
  throwError({
    type: 'auth',
    message:
      'There is no credential to push with.\n' +
      '  On your own computer, run `sherlo login`.\n' +
      `  In CI, set the project token as ${PROJECT_TOKEN_ENV_VAR}.`,
  });
}

function refuseOnEas(personCredential: PersonCredential): never {
  throwError({
    type: 'auth',
    message:
      `\`sherlo ${TEST_EAS_CLOUD_BUILD_COMMAND}\` takes a project token only, and found ` +
      `${personCredential}.\n` +
      "  Its token travels to Expo's build machine, so a person's login is never sent there.\n" +
      `  Set the project token as ${PROJECT_TOKEN_ENV_VAR}.`,
  });
}

function refuseNoProject(personCredential: PersonCredential): never {
  throwError({
    message:
      `sherlo.config.json names no project, so ${personCredential} has nowhere to push.\n` +
      '  Run `sherlo init` to choose one. It writes `project` into the config.',
  });
}

function refusePushOnPersonCredentialNotBuilt(): never {
  throwError({
    message:
      "Pushing on a person's credential is not built into this version of the CLI yet.\n" +
      '  Give a project token with `--token`.',
  });
}
