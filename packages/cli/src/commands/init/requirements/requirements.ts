import ora from 'ora';
import {
  APP_DOMAIN,
  EXPO_PACKAGE_NAME,
  REACT_NATIVE_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
  TOKEN_OPTION,
} from '../../../constants';
import {
  getPackageVersion,
  isValidToken,
  printLink,
  throwError,
  validatePackages,
} from '../../../helpers';
import { THIS_COMMAND } from '../constants';
import { printMessage, printTitle, trackProgress } from '../helpers';
import { EVENT } from './constants';
import validateReactNativeProject from './validateReactNativeProject';
import validateStorybook from './validateStorybook';

async function requirements({ token, sessionId }: { token?: string; sessionId: string }) {
  await validateProject(token);

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

async function validateProject(token?: string): Promise<void> {
  try {
    await validateReactNativeProject();

    await validateStorybook();

    validatePackages(THIS_COMMAND);

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
