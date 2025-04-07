import ora from 'ora';
import {
  APP_DOMAIN,
  EXPO_PACKAGE_NAME,
  REACT_NATIVE_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
} from '../../../constants';
import {
  isValidToken,
  printLink,
  throwError,
  validatePackages,
  getPackageVersion,
} from '../../../helpers';
import { THIS_COMMAND } from '../constants';
import { printTitle, printMessage, trackProgress } from '../helpers';
import { EVENT } from './constants';
import getEnvInfo from './getEnvInfo';
import validateReactNativeProject from './validateReactNativeProject';
import validateStorybook from './validateStorybook';

async function requirements(token?: string): Promise<{ sessionId: string }> {
  await validateProject(token);

  printTitle('✅ Requirements', 15);

  const spinner = ora('Checking requirements').start();

  const { sessionId } = await trackProgress({
    event: EVENT,
    params: {
      envInfo: await getEnvInfo(),
      expoVersion: getPackageVersion(EXPO_PACKAGE_NAME),
      reactNativeVersion: getPackageVersion(REACT_NATIVE_PACKAGE_NAME),
      storybookReactNativeVersion: getPackageVersion(STORYBOOK_REACT_NATIVE_PACKAGE_NAME),
    },
    token,
    sessionId: null,
    hasStarted: true,
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

  return { sessionId };
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
          'Invalid `--token`. Make sure you copied it correctly or generate a new one at ' +
          printLink(APP_DOMAIN),
      });
    }
  } catch (error) {
    console.log();

    throw error;
  }
}
