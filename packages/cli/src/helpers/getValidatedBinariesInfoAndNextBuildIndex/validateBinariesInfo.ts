import { REQUIRED_MIN_SDK_VERSION } from '../../../sdk-compatibility.json';
import {
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_DEV_CLIENT_PACKAGE_NAME,
  EXPO_UPDATE_COMMAND,
  PLATFORM_LABEL,
  PROFILE_OPTION,
  SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME,
} from '../../constants';
import { Command } from '../../types';
import { isPackageVersionCompatible } from '../shared';
import throwError from '../throwError';
import { BinariesInfo } from './types';

function validateBinariesInfo({
  binariesInfo,
  command,
}: {
  binariesInfo: BinariesInfo;
  command: Command;
}) {
  validateHasSherlo(binariesInfo);

  validateIsExpoDev({ binariesInfo, command });

  validateSdkVersion(binariesInfo);
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

function validateIsExpoDev({
  binariesInfo: { android, ios },
  command,
}: {
  binariesInfo: BinariesInfo;
  command: Command;
}) {
  if (command === EXPO_UPDATE_COMMAND) {
    const isNonDevAndroid = android && !android.isExpoDev;
    const isNonDevIos = ios && !ios.isExpoDev;

    if (isNonDevAndroid || isNonDevIos) {
      throwError(
        getError({
          type: 'not_dev_build',
          platformLabels: getPlatformLabels({ android: isNonDevAndroid, ios: isNonDevIos }),
        })
      );
    }
  } else {
    const isDevAndroid = android && android.isExpoDev;
    const isDevIos = ios && ios.isExpoDev;

    if (isDevAndroid || isDevIos) {
      throwError(
        getError({
          type: 'dev_build',
          platformLabels: getPlatformLabels({ android: isDevAndroid, ios: isDevIos }),
          command,
        })
      );
    }
  }
}

function validateSdkVersion({ android, ios }: BinariesInfo) {
  if (android?.sdkVersion && ios?.sdkVersion && android.sdkVersion !== ios.sdkVersion) {
    throwError(
      getError({
        type: 'different_versions',
        android: { sdkVersion: android.sdkVersion },
        ios: { sdkVersion: ios.sdkVersion },
      })
    );
  }

  const sdkVersion = android?.sdkVersion || ios?.sdkVersion;
  if (
    sdkVersion &&
    !isPackageVersionCompatible({ version: sdkVersion, minVersion: REQUIRED_MIN_SDK_VERSION })
  ) {
    throwError(
      getError({
        type: 'outdated_version',
        platformLabels: getPlatformLabels({ android: !!android, ios: !!ios }),
        sdkVersion,
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
      command: Exclude<Command, typeof EXPO_UPDATE_COMMAND>;
    }
  | { type: 'different_versions'; android: { sdkVersion: string }; ios: { sdkVersion: string } }
  | { type: 'outdated_version'; platformLabels: string[]; sdkVersion: string };

function getError(error: BinaryError) {
  switch (error.type) {
    case 'missing_sherlo':
      return {
        message:
          `Invalid ${error.platformLabels.join(' and ')} ${error.platformLabels.length > 1 ? 'builds' : 'build'}; Sherlo Native Module is missing\n\n` +
          'Please verify:\n' +
          `1. \`${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}\` is installed\n` +
          '2. Package is not excluded in `react-native.config.js`\n' +
          (error.hasIosSteps ? '3. `pod install` was run in `ios` folder (non-Expo only)\n' : '') +
          `${error.hasIosSteps ? '4' : '3'}. A new build was created after above steps`,
      };

    case 'not_dev_build':
      return {
        message:
          `Invalid ${error.platformLabels.join(' and ')} ${error.platformLabels.length > 1 ? 'builds' : 'build'}; \`sherlo ${EXPO_UPDATE_COMMAND}\` command requires development builds\n\n` +
          'Please verify:\n' +
          `1. Required \`${EXPO_DEV_CLIENT_PACKAGE_NAME}\` package is installed\n` +
          '2. EAS build profile is configured for development\n' +
          `3. ${error.platformLabels.length > 1 ? 'Builds are' : 'Build is'} created with this profile\n`,
        learnMoreLink: 'TODO: DOCS_LINK.expoUpdate',
      };

    case 'dev_build':
      return {
        message:
          `Invalid ${error.platformLabels.join(' and ')} ${error.platformLabels.length > 1 ? 'builds' : 'build'}; \`sherlo ${error.command}\` command requires non-development builds` +
          (error.command === EXPO_CLOUD_BUILDS_COMMAND
            ? '\n\n' +
              'Please verify:\n' +
              '1. EAS build profile is configured for non-development\n' +
              `2. ${error.platformLabels.length > 1 ? 'Builds are' : 'Build is'} created with this profile\n` +
              // TODO: lepszy komentarz? script? pozbyc sie tego? na pewno walidujemy to w easBuildScriptName (nie wiem jak z waitForEasBuild)
              `3. Same build profile is passed to \`sherlo ${EAS_BUILD_ON_COMPLETE_COMMAND}\` using \`--${PROFILE_OPTION}\` flag\n`
            : ''),
        learnMoreLink: 'TODO: DOCS_LINK.localBuilds / DOCS_LINK.expoCloudBuilds',
      };

    case 'different_versions':
      return {
        message:
          `${PLATFORM_LABEL.android} and ${PLATFORM_LABEL.ios} builds use different \`${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}\` versions\n\n` +
          `${PLATFORM_LABEL.android} version: ${error.android.sdkVersion}\n` +
          `${PLATFORM_LABEL.ios} version: ${error.ios.sdkVersion}\n\n` +
          `Rebuild ${PLATFORM_LABEL.android} and ${PLATFORM_LABEL.ios} builds`,
      };

    case 'outdated_version':
      return {
        message:
          `${error.platformLabels.join(' and ')} ${error.platformLabels.length > 1 ? 'builds' : 'build'} use outdated \`${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}\` version\n\n` +
          `Found version: ${error.sdkVersion}\n` +
          `Minimum required version: ${REQUIRED_MIN_SDK_VERSION}\n\n` +
          `Rebuild ${error.platformLabels.join(' and ')} ${error.platformLabels.length > 1 ? 'builds' : 'build'}`,
      };
  }
}

function getPlatformLabels({ android, ios }: { android?: boolean; ios?: boolean }): string[] {
  const platforms = [];

  if (android) platforms.push(PLATFORM_LABEL.android);
  if (ios) platforms.push(PLATFORM_LABEL.ios);

  return platforms;
}
