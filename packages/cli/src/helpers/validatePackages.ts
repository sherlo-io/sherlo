import {
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATES_COMMAND,
  MIN_REACT_NATIVE_VERSION,
  MIN_STORYBOOK_REACT_NATIVE_VERSION,
  MIN_EXPO_UPDATE_EXPO_VERSION,
} from '../constants';
import { Command } from '../types';
import isPackageVersionCompatible from './isPackageVersionCompatible';
import throwError from './throwError';

function validatePackages(command: Command) {
  const storybookReactNativeVersion = getPackageVersion('@storybook/react-native');
  const reactNativeVersion = getPackageVersion('react-native');

  if (
    !reactNativeVersion ||
    !isPackageVersionCompatible({
      version: reactNativeVersion,
      minVersion: MIN_REACT_NATIVE_VERSION,
    })
  ) {
    throwError({
      message: `\`react-native\` package is required at version \`${MIN_REACT_NATIVE_VERSION}\` or higher`,
    });
  }

  if (
    !storybookReactNativeVersion ||
    !isPackageVersionCompatible({
      version: storybookReactNativeVersion,
      minVersion: MIN_STORYBOOK_REACT_NATIVE_VERSION,
    })
  ) {
    throwError({
      message: `\`@storybook/react-native\` package is required at version \`${MIN_STORYBOOK_REACT_NATIVE_VERSION}\` or higher`,
    });
  }

  if (command === EXPO_UPDATES_COMMAND) {
    const expoVersion = getPackageVersion('expo');
    const expoDevClientVersion = getPackageVersion('expo-dev-client');

    if (
      !expoVersion ||
      !isPackageVersionCompatible({
        version: expoVersion,
        minVersion: MIN_EXPO_UPDATE_EXPO_VERSION,
      })
    ) {
      throwError({
        message: `\`sherlo ${EXPO_UPDATES_COMMAND}\` requires \`expo\` package version \`${MIN_EXPO_UPDATE_EXPO_VERSION}\` or higher`,
        learnMoreLink: 'TODO: add link to docs',
      });
    }

    if (!expoDevClientVersion) {
      throwError({
        message: `\`sherlo ${EXPO_UPDATES_COMMAND}\` requires \`expo-dev-client\` package`,
        learnMoreLink: 'TODO: add link to docs',
      });
    }
  } else if (command === EXPO_CLOUD_BUILDS_COMMAND) {
    const expoVersion = getPackageVersion('expo');

    if (!expoVersion) {
      throwError({
        message: `\`sherlo ${EXPO_CLOUD_BUILDS_COMMAND}\` requires \`expo\` package`,
      });
    }
  }
}

export default validatePackages;

/* ========================================================================== */

function getPackageVersion(packageName: string): string | null {
  try {
    const pkgPath = require.resolve(`${packageName}/package.json`);
    return require(pkgPath).version;
  } catch {
    return null;
  }
}
