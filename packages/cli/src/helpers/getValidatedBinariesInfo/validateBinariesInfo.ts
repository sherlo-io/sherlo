import { REQUIRED_MIN_SDK_VERSION } from '../../../sdk-compatibility.json';
import { PACKAGE_NAME } from '../../constants';
import throwError from '../throwError';
import { BinariesInfo } from './types';

function validateBinariesInfo(
  { android, ios }: Pick<BinariesInfo, 'android' | 'ios'>,
  { isExpoUpdate }: { isExpoUpdate: boolean }
) {
  validateHasSherlo({ android, ios });

  validateSdkVersion({ android, ios });

  if (isExpoUpdate) {
    if (android && ios && !android.isExpoDev && ios && !ios.isExpoDev) {
      // TODO: dodac learnMore link + lepsze objasnienie (musi byc zainstalowana expo-dev paczka + musi byc eas profile pod development) - zrobic liste krokow jak przy hasSherlo
      throwError({
        message: 'Both Android and iOS builds must be development builds for Expo update',
      });
    }

    if (android && !android.isExpoDev) {
      throwError({
        message: 'Android build must be a development build for Expo update',
      });
    }

    if (ios && !ios.isExpoDev) {
      throwError({
        message: 'iOS build must be a development build for Expo update',
      });
    }
  }
}

export default validateBinariesInfo;

/* ========================================================================== */

function validateHasSherlo({ android, ios }: Pick<BinariesInfo, 'android' | 'ios'>) {
  const verifySteps = ({ hasIosStep } = { hasIosStep: true }) =>
    'Please verify:\n' +
    `1. \`${PACKAGE_NAME}\` is installed\n` +
    '2. Package is not excluded in `react-native.config.js`\n' +
    (hasIosStep ? '3. `pod install` was run in `ios` folder (non-Expo only)\n' : '') +
    `${hasIosStep ? '4' : '3'}. A new build was created after above steps`;

  if (android && !android.hasSherlo && ios && !ios.hasSherlo) {
    throwError({
      message: 'Neither Android nor iOS builds contain Sherlo Native Module\n\n' + verifySteps(),
    });
  }

  if (android && !android.hasSherlo) {
    throwError({
      message:
        'Android build does not contain Sherlo Native Module\n\n' +
        verifySteps({ hasIosStep: false }),
    });
  }

  // Michal: Temporary disabled to run tests
  // if (ios && !ios.hasSherlo) {
  //   throwError({
  //     message: 'iOS build does not contain Sherlo Native Module\n\n' + verifySteps(),
  //   });
  // }
}

function validateSdkVersion({ android, ios }: Pick<BinariesInfo, 'android' | 'ios'>) {
  const sdkVersions: { platform: string; sdkVersion: string }[] = [];

  if (android?.sdkVersion) {
    sdkVersions.push({ platform: 'Android', sdkVersion: android.sdkVersion });
  }

  if (ios?.sdkVersion) {
    sdkVersions.push({ platform: 'iOS', sdkVersion: ios.sdkVersion });
  }

  const incompatibleSdkVersions = sdkVersions.filter(
    ({ sdkVersion }) => !isSdkVersionCompatible(sdkVersion)
  );

  if (incompatibleSdkVersions.length > 0) {
    const versionsInfo = incompatibleSdkVersions
      .map(({ platform, sdkVersion }) => `${platform}: ${sdkVersion}`)
      .join(', ');

    const isSinglePlatform = incompatibleSdkVersions.length === 1;

    throwError({
      message:
        `Your ${isSinglePlatform ? 'build contains' : 'builds contain'} outdated \`${PACKAGE_NAME}\` ${isSinglePlatform ? 'version' : 'versions'}\n\n` +
        `Found ${isSinglePlatform ? 'version' : 'versions'}: ${versionsInfo}\n` +
        `Minimum required version: ${REQUIRED_MIN_SDK_VERSION}\n` +
        `\nPlease rebuild your ${isSinglePlatform ? 'app' : 'apps'}`,
    });
  }
}

function isSdkVersionCompatible(sdkVersion: string): boolean {
  const sdkParts = sdkVersion.split('.').map(Number);
  const minParts = REQUIRED_MIN_SDK_VERSION.split('.').map(Number);

  if (sdkParts.length !== 3 || minParts.length !== 3) {
    throwError({
      type: 'unexpected',
      message: 'SDK version must contain exactly 3 numbers',
    });
  }

  for (let i = 0; i < 3; i++) {
    if (sdkParts[i] > minParts[i]) return true;
    if (sdkParts[i] < minParts[i]) return false;
  }

  return true; // Versions are equal
}
