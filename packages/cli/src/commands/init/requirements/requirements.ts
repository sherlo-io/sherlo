import chalk from 'chalk';
import {
  EXPO_PACKAGE_NAME,
  FULL_INIT_COMMAND,
  REACT_NATIVE_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
  TOKEN_OPTION,
} from '../../../constants';
import getAppDomain from '../../../helpers/getAppDomain';
import {
  isValidToken,
  printLink,
  refuseIfPersonalToken,
  spinner as createSpinner,
  throwError,
} from '../../../helpers';
import {
  renderRequirementsMet,
  renderRequirementsTitle,
  renderScenesNeedNoStorybook,
} from '../../../render/initRequirements';
import { workstation } from '../../../seams/workstation';
import { asConfigProject } from '../project/projectAddress';
import { printLines, trackProgress } from '../helpers';
import { EVENT } from './constants';
import getPackageVersion from './getPackageVersion';
import validateCorePackagesVersions from './validateCorePackagesVersions';
import validateHasReactNative from './validateHasReactNative';
import hasStorybook, { refuseMissingStorybook } from './hasStorybook';
import validateHasWithStorybookInMetroConfig from './validateHasWithStorybookInMetroConfig';
import validateProjectContext from './validateProjectContext';

/**
 * Every check that needs nothing from the team. Answers whether the app has Storybook: an app
 * without it is neither passed nor refused here, because whether scenes are on is known only once
 * setup has the team (`settleNoStorybook` decides it). Its success is reported there too.
 */
async function requirements({
  token,
  sessionId,
}: {
  token?: string;
  sessionId: string | null;
}): Promise<{ appHasStorybook: boolean }> {
  let appHasStorybook: boolean;
  try {
    appHasStorybook = await validateRequirements(token);
  } catch (error) {
    await trackProgress({
      event: EVENT,
      params: { status: 'failed', error },
      sessionId,
    });
    throw error;
  }

  printLines(renderRequirementsTitle());

  if (appHasStorybook) await reportRequirementsMet(sessionId);

  printLines(renderRequirementsMet(appHasStorybook));

  return { appHasStorybook };
}

export default requirements;

/**
 * The end of the checks for an app with no Storybook, once the team is known: scenes on, the run
 * is told scenes need none and its requirements are reported met; scenes off, it is refused as
 * ever and the requirements report says failed.
 */
export async function settleNoStorybook({
  teamId,
  sessionId,
}: {
  teamId: string | undefined;
  sessionId: string | null;
}): Promise<void> {
  // No team yet (a person in none) means a team about to be made, which has scenes off. The
  // project number is a placeholder: the service is asked about the team alone.
  await workstation().askScenesFlag(
    teamId === undefined ? undefined : asConfigProject({ teamId, projectIndex: 1 })
  );

  if (workstation().scenesFlag() !== 'on') {
    try {
      refuseMissingStorybook();
    } catch (error) {
      await trackProgress({ event: EVENT, params: { status: 'failed', error }, sessionId });
      throw error;
    }
  }

  printLines(renderScenesNeedNoStorybook());
  await reportRequirementsMet(sessionId);
}

/* ========================================================================== */

async function reportRequirementsMet(sessionId: string | null): Promise<void> {
  const spinner = createSpinner('Checking requirements').start();

  await trackProgress({
    event: EVENT,
    params: {
      expoVersion: getPackageVersion(EXPO_PACKAGE_NAME),
      reactNativeVersion: getPackageVersion(REACT_NATIVE_PACKAGE_NAME),
      storybookReactNativeVersion: getPackageVersion(STORYBOOK_REACT_NATIVE_PACKAGE_NAME),
    },
    sessionId,
  });

  spinner.stop();
}

/** Throws on a failed check; answers whether the app has Storybook. */
async function validateRequirements(token?: string): Promise<boolean> {
  try {
    await validateProjectContext();

    await validateHasReactNative();

    const appHasStorybook = await hasStorybook();

    if (appHasStorybook) await validateHasWithStorybookInMetroConfig();

    validateCorePackagesVersions();

    // Named refusal first: a personal token gets its own message, not the generic
    // "invalid token" one below.
    if (token) refuseIfPersonalToken(token);

    if (token && !isValidToken(token)) {
      throwError({
        message:
          `Invalid \`--${TOKEN_OPTION}\` value\n` +
          '\n' +
          chalk.reset('Make sure you copied it correctly or generate a new one at ') +
          printLink(getAppDomain()),
        below: '\n' + chalk.reset('Then re-run:\n') + chalk.cyan(`  ${FULL_INIT_COMMAND}`),
      });
    }

    return appHasStorybook;
  } catch (error) {
    throw error;
  }
}
