import ora from 'ora';
import {
  EXPO_PACKAGE_NAME,
  REACT_NATIVE_PACKAGE_NAME,
  STORYBOOK_REACT_NATIVE_PACKAGE_NAME,
} from '../../../constants';
import { getPackageVersion } from '../../../helpers';
import { printMessage, printTitle, trackProgress } from '../helpers';
import { ProjectType } from '../types';
import { EVENT } from './constants';
import getEnvInfo from './getEnvInfo';

async function projectDetection({
  projectType,
  token,
}: {
  projectType: ProjectType;
  token?: string;
}): Promise<{ sessionId: string }> {
  printTitle('🔍 Project Detection');

  const spinner = ora('Detecting project').start();

  const params: Record<string, any> = {
    envInfo: await getEnvInfo(),
    reactNativeVersion: getPackageVersion(REACT_NATIVE_PACKAGE_NAME),
    storybookReactNativeVersion: getPackageVersion(STORYBOOK_REACT_NATIVE_PACKAGE_NAME),
  };

  if (projectType === 'expo') {
    params.expoVersion = getPackageVersion(EXPO_PACKAGE_NAME);
  }

  spinner.stop();

  printMessage({
    type: 'success',
    message: `React Native (${projectType === 'expo' ? 'with' : 'without'} Expo)`,
  });

  printMessage({
    type: 'success',
    message: 'Storybook',
  });

  const { sessionId } = await trackProgress({
    event: EVENT,
    params,
    token,
    sessionId: null,
    hasStarted: true,
  });

  return { sessionId };
}

export default projectDetection;
