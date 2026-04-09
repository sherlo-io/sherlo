import {
  DOCS_LINK,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EXPO_DEV_CLIENT_PACKAGE_NAME,
  EXPO_PACKAGE_NAME,
  MIN_EAS_UPDATE_EXPO_VERSION,
  PLATFORM_LABEL,
  PROFILE_OPTION,
  SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME,
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TEST_EAS_UPDATE_COMMAND,
} from '../../constants';
import { BinariesInfo, Command } from '../../types';
import isPackageVersionCompatible from '../isPackageVersionCompatible';
import throwError from '../throwError';

function validateBinariesInfo({
  binariesInfo,
  command,
}: {
  binariesInfo: BinariesInfo;
  command: Command;
}) {
  validateHasSherlo(binariesInfo);

  validateBuildType({ binariesInfo, command });

  if (command === TEST_EAS_UPDATE_COMMAND) {
    validateEasUpdateRequirements(binariesInfo);
  }
}

export default validateBinariesInfo;

/* ========================================================================== */

function validateHasSherlo({ android, ios }: BinariesInfo) {
  const isAndroidMissingSherlo = android && !android.sdkVersion;
  const isIosMissingSherlo = ios && !ios.sdkVersion;

  if (isAndroidMissingSherlo || isIosMissingSherlo) {
    throwError(
      getError({
        type: 'missing_sherlo',
        platformLabels: getPlatformLabels({
          android: isAndroidMissingSherlo,
          ios: isIosMissingSherlo,
        }),
        hasIosSteps: isIosMissingSherlo,
      })
    );
  }
}

function validateBuildType({
  binariesInfo: { android, ios },
  command,
}: {
  binariesInfo: BinariesInfo;
  command: Command;
}) {
  if (command === TEST_EAS_UPDATE_COMMAND) {
    const isPreviewAndroid = android && android.buildType !== 'development';
    const isPreviewIos = ios && ios.buildType !== 'development';

    if (isPreviewAndroid || isPreviewIos) {
      throwError(
        getError({
          type: 'not_dev_build',
          platformLabels: getPlatformLabels({ android: isPreviewAndroid, ios: isPreviewIos }),
        })
      );
    }
  } else {
    const isDevelopmentAndroid = android && android.buildType === 'development';
    const isDevelopmentIos = ios && ios.buildType === 'development';

    if (isDevelopmentAndroid || isDevelopmentIos) {
      throwError(
        getError({
          type: 'dev_build',
          platformLabels: getPlatformLabels({ android: isDevelopmentAndroid, ios: isDevelopmentIos }),
          command,
        })
      );
    }
  }
}

function validateEasUpdateRequirements({ android, ios }: BinariesInfo) {
  const isMissingExpoDevClientAndroid = android && !android.hasExpoDevClient;
  const isMissingExpoDevClientIos = ios && !ios.hasExpoDevClient;
  const hasMissingExpoDevClient = isMissingExpoDevClientAndroid || isMissingExpoDevClientIos;

  const isOutdatedExpoAndroid =
    android?.expoSdkVersion &&
    !isPackageVersionCompatible({
      version: android.expoSdkVersion,
      minVersion: MIN_EAS_UPDATE_EXPO_VERSION,
    });
  const isOutdatedExpoIos =
    ios?.expoSdkVersion &&
    !isPackageVersionCompatible({
      version: ios.expoSdkVersion,
      minVersion: MIN_EAS_UPDATE_EXPO_VERSION,
    });
  const hasOutdatedExpo = isOutdatedExpoAndroid || isOutdatedExpoIos;

  // Show both issues at once so user can fix everything in one pass
  if (hasMissingExpoDevClient && hasOutdatedExpo) {
    throwError(
      getError({
        type: 'missing_dev_client_and_outdated_expo',
        missingDevClientPlatformLabels: getPlatformLabels({
          android: isMissingExpoDevClientAndroid,
          ios: isMissingExpoDevClientIos,
        }),
        outdatedExpoPlatformLabels: getPlatformLabels({
          android: !!isOutdatedExpoAndroid,
          ios: !!isOutdatedExpoIos,
        }),
        expoSdkVersion: (android?.expoSdkVersion || ios?.expoSdkVersion)!,
      })
    );
  }

  if (hasMissingExpoDevClient) {
    throwError(
      getError({
        type: 'missing_expo_dev_client',
        platformLabels: getPlatformLabels({
          android: isMissingExpoDevClientAndroid,
          ios: isMissingExpoDevClientIos,
        }),
      })
    );
  }

  if (hasOutdatedExpo) {
    throwError(
      getError({
        type: 'outdated_expo_version',
        platformLabels: getPlatformLabels({
          android: !!isOutdatedExpoAndroid,
          ios: !!isOutdatedExpoIos,
        }),
        expoSdkVersion: (android?.expoSdkVersion || ios?.expoSdkVersion)!,
      })
    );
  }
}

type BinaryError =
  | { type: 'missing_sherlo'; platformLabels: string[]; hasIosSteps?: boolean }
  | { type: 'not_dev_build'; platformLabels: string[] }
  | {
      type: 'dev_build';
      platformLabels: string[];
      command: Exclude<Command, typeof TEST_EAS_UPDATE_COMMAND>;
    }
  | { type: 'missing_expo_dev_client'; platformLabels: string[] }
  | {
      type: 'missing_dev_client_and_outdated_expo';
      missingDevClientPlatformLabels: string[];
      outdatedExpoPlatformLabels: string[];
      expoSdkVersion: string;
    }
  | { type: 'outdated_expo_version'; platformLabels: string[]; expoSdkVersion: string }

function getError(error: BinaryError) {
  switch (error.type) {
    case 'missing_sherlo':
      return {
        message:
          `Invalid ${error.platformLabels.join(' and ')} ${
            error.platformLabels.length > 1 ? 'builds' : 'build'
          }; Sherlo Native Module is missing\n\n` +
          'Please verify:\n' +
          `1. \`${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}\` is installed\n` +
          '2. Package is not excluded in `react-native.config.js`\n' +
          (error.hasIosSteps ? '3. `pod install` was run in `ios` folder (non-Expo only)\n' : '') +
          `${error.hasIosSteps ? '4' : '3'}. A new build was created after above steps`,
      };

    case 'not_dev_build':
      return {
        message:
          `${error.platformLabels.join(' and ')} ${
            error.platformLabels.length > 1
              ? 'builds are preview builds'
              : 'build is a preview build'
          }; EAS Update testing requires development simulator builds (without JS bundle)\n\n` +
          'Please verify:\n' +
          `1. \`${EXPO_PACKAGE_NAME}\` package is at version ${MIN_EAS_UPDATE_EXPO_VERSION} or higher\n` +
          `2. Required \`${EXPO_DEV_CLIENT_PACKAGE_NAME}\` package is installed\n` +
          '3. EAS build profile is configured for Development Simulator Build\n' +
          `4. ${
            error.platformLabels.length > 1 ? 'Builds are' : 'Build is'
          } created with this profile\n`,
        learnMoreLink: DOCS_LINK.buildDevelopment,
      };

    case 'dev_build':
      return {
        message:
          `${error.platformLabels.join(' and ')} ${
            error.platformLabels.length > 1
              ? 'builds are development builds'
              : 'build is a development build'
          }; Standard testing requires preview simulator builds (with JS bundle)` +
          (error.command === TEST_EAS_CLOUD_BUILD_COMMAND
            ? '\n\n' +
              'Please verify:\n' +
              '1. EAS build profile is configured for Preview Simulator Build\n' +
              `2. ${
                error.platformLabels.length > 1 ? 'Builds are' : 'Build is'
              } created with this profile\n` +
              `3. Same build profile is passed to \`sherlo ${EAS_BUILD_ON_COMPLETE_COMMAND}\` using \`--${PROFILE_OPTION}\` option\n`
            : ''),
        learnMoreLink: DOCS_LINK.buildPreview,
      };

    case 'missing_expo_dev_client':
      return {
        message:
          `${error.platformLabels.join(' and ')} ${
            error.platformLabels.length > 1
              ? 'builds do not include'
              : 'build does not include'
          } \`${EXPO_DEV_CLIENT_PACKAGE_NAME}\`; EAS Update testing requires it to load updates\n\n` +
          'Please verify:\n' +
          `1. \`${EXPO_DEV_CLIENT_PACKAGE_NAME}\` package is installed\n` +
          `2. ${
            error.platformLabels.length > 1 ? 'Builds are' : 'Build is'
          } created after installing the package\n`,
        learnMoreLink: DOCS_LINK.buildDevelopment,
      };

    case 'missing_dev_client_and_outdated_expo':
      return {
        message:
          `Multiple EAS Update requirements not met:\n\n` +
          `1. ${error.missingDevClientPlatformLabels.join(' and ')} ${
            error.missingDevClientPlatformLabels.length > 1
              ? 'builds do not include'
              : 'build does not include'
          } \`${EXPO_DEV_CLIENT_PACKAGE_NAME}\`\n` +
          `2. Expo SDK ${error.expoSdkVersion} is below minimum ${MIN_EAS_UPDATE_EXPO_VERSION} (${error.outdatedExpoPlatformLabels.join(' and ')})\n\n` +
          'Please verify:\n' +
          `1. \`${EXPO_PACKAGE_NAME}\` package is updated to version ${MIN_EAS_UPDATE_EXPO_VERSION} or higher\n` +
          `2. \`${EXPO_DEV_CLIENT_PACKAGE_NAME}\` package is installed\n` +
          '3. Builds are created after these changes\n',
        learnMoreLink: DOCS_LINK.buildDevelopment,
      };

    case 'outdated_expo_version':
      return {
        message:
          `${error.platformLabels.join(' and ')} ${
            error.platformLabels.length > 1 ? 'builds use' : 'build uses'
          } Expo SDK ${error.expoSdkVersion}; EAS Update testing requires SDK ${MIN_EAS_UPDATE_EXPO_VERSION} or higher\n\n` +
          'Please verify:\n' +
          `1. \`${EXPO_PACKAGE_NAME}\` package is updated to version ${MIN_EAS_UPDATE_EXPO_VERSION} or higher\n` +
          `2. ${
            error.platformLabels.length > 1 ? 'Builds are' : 'Build is'
          } created after updating the package\n`,
        learnMoreLink: DOCS_LINK.testEasUpdate,
      };

  }
}

function getPlatformLabels({ android, ios }: { android?: boolean; ios?: boolean }): string[] {
  const platforms = [];

  if (android) platforms.push(PLATFORM_LABEL.android);
  if (ios) platforms.push(PLATFORM_LABEL.ios);

  return platforms;
}
