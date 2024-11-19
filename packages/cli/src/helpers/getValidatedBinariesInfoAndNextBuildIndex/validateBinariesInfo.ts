import { REQUIRED_MIN_SDK_VERSION } from '../../../sdk-compatibility.json';
import { EXPO_UPDATES_COMMAND, PACKAGE_NAME, PLATFORM_LABEL } from '../../constants';
import { Command } from '../../types';
import isPackageVersionCompatible from '../isPackageVersionCompatible';
import throwError from '../throwError';
import { BinariesInfo } from './types';

function validateBinariesInfo({ android, ios, command }: BinariesInfo & { command: Command }) {
  validateHasSherlo({ android, ios });

  validateIsExpoDev({ android, ios, command });

  validateSdkVersion({ android, ios });
}

export default validateBinariesInfo;

/* ========================================================================== */

function validateHasSherlo({ android, ios }: BinariesInfo) {
  const getSherloModuleError = ({ android, ios }: { android?: boolean; ios?: boolean }) => {
    const platformLabels = getPlatformLabels({ android, ios });

    const message =
      platformLabels.length > 1
        ? `Neither ${platformLabels.join(' nor ')} builds contain Sherlo Native Module`
        : `${platformLabels[0]} build does not contain Sherlo Native Module`;

    return {
      message:
        message +
        '\n\n' +
        'Please verify:\n' +
        `1. \`${PACKAGE_NAME}\` is installed\n` +
        '2. Package is not excluded in `react-native.config.js`\n' +
        (ios ? '3. `pod install` was run in `ios` folder (non-Expo only)\n' : '') +
        `${ios ? '4' : '3'}. A new build was created after above steps`,
    };
  };

  if (android && !android.sdkVersion && ios && !ios.sdkVersion) {
    throwError(getSherloModuleError({ android: true, ios: true }));
  }

  if (android && !android.sdkVersion) {
    throwError(getSherloModuleError({ android: true }));
  }

  if (ios && !ios.sdkVersion) {
    throwError(getSherloModuleError({ ios: true }));
  }
}

function validateIsExpoDev({ android, ios, command }: BinariesInfo & { command: Command }) {
  if (command === EXPO_UPDATES_COMMAND) {
    const getExpoUpdateError = ({ android, ios }: { android?: boolean; ios?: boolean }) => {
      const platformLabels = getPlatformLabels({ android, ios });

      return {
        message:
          `\`sherlo ${EXPO_UPDATES_COMMAND}\` command requires development builds ` +
          `(${platformLabels.join(' and ')} ${platformLabels.length > 1 ? 'are' : 'is'} invalid)\n\n` +
          'Please verify:\n' +
          '1. Required `expo-dev-client` package is installed\n' +
          '2. EAS build profile is configured for development\n' +
          `3. ${platformLabels.join(' and ')} ${platformLabels.length > 1 ? 'are' : 'is'} built using development profile\n`,
        learnMoreLink: 'TODO: DOCS_LINK.expoUpdate',
      };
    };

    if (android && !android.isExpoDev && ios && !ios.isExpoDev) {
      throwError(getExpoUpdateError({ android: true, ios: true }));
    }

    if (android && !android.isExpoDev) {
      throwError(getExpoUpdateError({ android: true }));
    }

    if (ios && !ios.isExpoDev) {
      throwError(getExpoUpdateError({ ios: true }));
    }
  } else {
    const getLocalBuildsError = ({ android, ios }: { android?: boolean; ios?: boolean }) => {
      const platformLabels = getPlatformLabels({ android, ios });

      return {
        message: `\`sherlo ${command}\` command requires non-development builds (${platformLabels.join(' and ')} ${platformLabels.length > 1 ? 'are' : 'is'} invalid)`,
        learnMoreLink: 'TODO: DOCS_LINK.localBuilds / DOCS_LINK.expoCloudBuilds',
      };
    };

    if (android && android.isExpoDev && ios && ios.isExpoDev) {
      throwError(getLocalBuildsError({ android: true, ios: true }));
    }

    if (android && android.isExpoDev) {
      throwError(getLocalBuildsError({ android: true }));
    }

    if (ios && ios.isExpoDev) {
      throwError(getLocalBuildsError({ ios: true }));
    }
  }
}

function validateSdkVersion({ android, ios }: BinariesInfo) {
  // Check if Android and iOS versions match
  if (android?.sdkVersion && ios?.sdkVersion && android.sdkVersion !== ios.sdkVersion) {
    throwError({
      message:
        `${PLATFORM_LABEL.android} and ${PLATFORM_LABEL.ios} builds contain different \`${PACKAGE_NAME}\` versions\n\n` +
        `${PLATFORM_LABEL.android} version: ${android.sdkVersion}\n` +
        `${PLATFORM_LABEL.ios} version: ${ios.sdkVersion}\n\n` +
        'Please rebuild both apps to ensure they use the same version',
    });
  }

  // Check if versions are compatible with minimum required version
  const sdkVersion = android?.sdkVersion || ios?.sdkVersion;
  if (
    sdkVersion &&
    !isPackageVersionCompatible({ version: sdkVersion, minVersion: REQUIRED_MIN_SDK_VERSION })
  ) {
    const hasBothPlatforms = android?.sdkVersion && ios?.sdkVersion;
    throwError({
      message:
        `Your ${hasBothPlatforms ? 'builds contain' : 'build contains'} outdated \`${PACKAGE_NAME}\` version\n\n` +
        `Found version: ${sdkVersion}\n` +
        `Minimum required version: ${REQUIRED_MIN_SDK_VERSION}\n\n` +
        `Please rebuild your ${hasBothPlatforms ? 'apps' : 'app'}`,
    });
  }
}

function getPlatformLabels({ android, ios }: { android?: boolean; ios?: boolean }): string[] {
  const platforms = [];

  if (android) platforms.push(PLATFORM_LABEL.android);
  if (ios) platforms.push(PLATFORM_LABEL.ios);

  return platforms;
}
