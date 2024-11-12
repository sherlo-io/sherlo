import { REQUIRED_MIN_SDK_VERSION } from '../../../sdk-compatibility.json';
import { PACKAGE_NAME } from '../../constants';
import isPackageVersionCompatible from '../isPackageVersionCompatible';
import throwError from '../throwError';
import { BinariesInfo } from './types';

function validateBinariesInfo(
  { android, ios }: BinariesInfo,
  { isExpoUpdate }: { isExpoUpdate: boolean }
) {
  validateHasSherlo({ android, ios });

  validateIsExpoDev({ android, ios, isExpoUpdate });

  validateSdkVersion({ android, ios });
}

export default validateBinariesInfo;

/* ========================================================================== */

function validateHasSherlo({ android, ios }: BinariesInfo) {
  const getSherloModuleError = ({ android, ios }: { android?: boolean; ios?: boolean }) => {
    const platforms = [android && 'Android', ios && 'iOS'].filter(Boolean);
    const message =
      platforms.length > 1
        ? 'Neither Android nor iOS builds contain Sherlo Native Module'
        : `${platforms[0]} build does not contain Sherlo Native Module`;

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

function validateIsExpoDev({
  android,
  ios,
  isExpoUpdate,
}: BinariesInfo & { isExpoUpdate: boolean }) {
  if (isExpoUpdate) {
    const getExpoUpdateError = ({ android, ios }: { android?: boolean; ios?: boolean }) => {
      const platforms = [android && 'Android', ios && 'iOS'].filter(Boolean);

      return {
        message:
          '`sherlo expo-update` command requires development builds ' +
          `(${platforms.join(' and ')} ${platforms.length > 1 ? 'are' : 'is'} invalid)\n\n` +
          'Please verify:\n' +
          '1. Required `expo-dev-client` package is installed\n' +
          '2. EAS build profile is configured for development\n' +
          `3. ${platforms.join(' and ')} ${platforms.length > 1 ? 'are' : 'is'} built using development profile\n`,
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
      const platforms = [android && 'Android', ios && 'iOS'].filter(Boolean);

      return {
        message: `\`sherlo local-builds\` command requires non-development builds (${platforms.join(' and ')} ${platforms.length > 1 ? 'are' : 'is'} invalid)`,
        learnMoreLink: 'TODO: DOCS_LINK.localBuilds',
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
        `Android and iOS builds contain different \`${PACKAGE_NAME}\` versions\n\n` +
        `Android version: ${android.sdkVersion}\n` +
        `iOS version: ${ios.sdkVersion}\n\n` +
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
