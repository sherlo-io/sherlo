import chalk from 'chalk';
import {
  APP_DOMAIN,
  EXPO_PACKAGE_NAME,
  FULL_INIT_COMMAND,
  REACT_NATIVE_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
  TOKEN_OPTION,
} from '../../../constants';
import {
  isValidToken,
  printLink,
  refuseIfPersonalToken,
  spinner as createSpinner,
  throwError,
} from '../../../helpers';
import { renderRequirementsMet, renderRequirementsTitle } from '../../../render/initRequirements';
import { printLines, trackProgress } from '../helpers';
import { EVENT } from './constants';
import getPackageVersion from './getPackageVersion';
import validateCorePackagesVersions from './validateCorePackagesVersions';
import validateHasReactNative from './validateHasReactNative';
import validateHasStorybook from './validateHasStorybook';
import validateHasWithStorybookInMetroConfig from './validateHasWithStorybookInMetroConfig';
import validateProjectContext from './validateProjectContext';

async function requirements({ token, sessionId }: { token?: string; sessionId: string | null }) {
  try {
    await validateRequirements(token);
  } catch (error) {
    await trackProgress({
      event: EVENT,
      params: { status: 'failed', error },
      sessionId,
    });
    throw error;
  }

  printLines(renderRequirementsTitle());

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

  printLines(renderRequirementsMet());
}

export default requirements;

/* ========================================================================== */

async function validateRequirements(token?: string): Promise<void> {
  try {
    await validateProjectContext();

    await validateHasReactNative();

    await validateHasStorybook();

    await validateHasWithStorybookInMetroConfig();

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
          printLink(APP_DOMAIN),
        below: '\n' + chalk.reset('Then re-run:\n') + chalk.cyan(`  ${FULL_INIT_COMMAND}`),
      });
    }
  } catch (error) {
    throw error;
  }
}
