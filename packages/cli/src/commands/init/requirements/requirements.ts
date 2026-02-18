import ora from 'ora';
import {
  APP_DOMAIN,
  EXPO_PACKAGE_NAME,
  REACT_NATIVE_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
  TOKEN_OPTION,
} from '../../../constants';
import {
  isValidToken,
  printLink,
  throwError,
} from '../../../helpers';
import { printMessage, printTitle, trackProgress } from '../helpers';
import { EVENT } from './constants';
import getPackageVersion from './getPackageVersion';
import validateCorePackagesVersions from './validateCorePackagesVersions';
import validateHasReactNative from './validateHasReactNative';
import validateHasStorybook from './validateHasStorybook';
import validateProjectContext from './validateProjectContext';

async function requirements({ token, sessionId }: { token?: string; sessionId: string | null }) {
  await validateRequirements(token);

  printTitle('✅ Requirements', 15);

  const spinner = ora('Checking requirements').start();

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

  printMessage({
    type: 'success',
    message: 'React Native',
  });

  printMessage({
    type: 'success',
    message: 'Storybook',
  });
}

export default requirements;

/* ========================================================================== */

async function validateRequirements(token?: string): Promise<void> {
  try {
    await validateProjectContext();

    await validateHasReactNative();

    await validateHasStorybook();

    validateCorePackagesVersions();

    if (token && !isValidToken(token)) {
      throwError({
        message:
          `Invalid \`--${TOKEN_OPTION}\`. Make sure you copied it correctly or generate a new one at ` +
          printLink(APP_DOMAIN),
        errorToReport: new Error('Invalid token: ' + token),
      });
    }
  } catch (error) {
    console.log();

    throw error;
  }
}
