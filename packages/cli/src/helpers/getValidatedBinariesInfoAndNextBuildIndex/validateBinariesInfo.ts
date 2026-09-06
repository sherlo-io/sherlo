import {
  ANDROID_ARM64_ABI,
  DOCS_LINK,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  PLATFORM_LABEL,
  PROFILE_OPTION,
  SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME,
  TEST_EAS_CLOUD_BUILD_COMMAND,
} from '../../constants';
import { BinariesInfo, Command } from '../../types';
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

  validateAndroidAbiRequirements(binariesInfo);
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
  const isDevelopmentAndroid = android && android.buildType === 'development';
  const isDevelopmentIos = ios && ios.buildType === 'development';

  if (isDevelopmentAndroid || isDevelopmentIos) {
    throwError(
      getError({
        type: 'dev_build',
        platformLabels: getPlatformLabels({
          android: isDevelopmentAndroid,
          ios: isDevelopmentIos,
        }),
        command,
      })
    );
  }
}

function validateAndroidAbiRequirements({ android }: BinariesInfo) {
  if (!android?.androidAbis) return;

  const abis = android.androidAbis;
  // An APK with no lib/ entries has no native code and installs on any ABI - pass
  if (abis.length === 0) return;

  if (!abis.includes(ANDROID_ARM64_ABI)) {
    const detectedAbis = abis.join(', ');
    const fileName = android.fileName;

    throwError(
      getError(
        android.expoSdkVersion
          ? { type: 'missing_arm64_abi_expo', detectedAbis, fileName }
          : { type: 'missing_arm64_abi_bare_rn', detectedAbis, fileName }
      )
    );
  }
}

type BinaryError =
  | { type: 'missing_sherlo'; platformLabels: string[]; hasIosSteps?: boolean }
  | { type: 'dev_build'; platformLabels: string[]; command: Command }
  | { type: 'missing_arm64_abi_expo'; detectedAbis: string; fileName: string }
  | { type: 'missing_arm64_abi_bare_rn'; detectedAbis: string; fileName: string };

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

    case 'missing_arm64_abi_expo':
      return {
        message:
          'Android build is missing arm64-v8a native libraries; ' +
          "Sherlo's Android emulators require arm64-v8a\n\n" +
          `Detected ABIs: ${error.detectedAbis}\n\n` +
          'Please verify:\n' +
          '1. `expo-build-properties` plugin is in your app config and `buildArchs` includes `arm64-v8a` ' +
          '(the Expo default already does - check if it was overridden)\n' +
          '2. A new build was created after any config changes\n' +
          `3. Run \`unzip -l ${error.fileName} | grep lib/\` to confirm which ABIs are in the APK\n`,
        learnMoreLink: DOCS_LINK.buildAndroidAbiRequirements,
      };

    case 'missing_arm64_abi_bare_rn':
      return {
        message:
          'Android build is missing arm64-v8a native libraries; ' +
          "Sherlo's Android emulators require arm64-v8a\n\n" +
          `Detected ABIs: ${error.detectedAbis}\n\n` +
          'Please verify:\n' +
          '1. `reactNativeArchitectures` in `android/gradle.properties` includes `arm64-v8a`\n' +
          '2. A new build was created after any config changes\n' +
          `3. Run \`unzip -l ${error.fileName} | grep lib/\` to confirm which ABIs are in the APK\n`,
        learnMoreLink: DOCS_LINK.buildAndroidAbiRequirements,
      };
  }
}

function getPlatformLabels({ android, ios }: { android?: boolean; ios?: boolean }): string[] {
  const platforms = [];

  if (android) platforms.push(PLATFORM_LABEL.android);
  if (ios) platforms.push(PLATFORM_LABEL.ios);

  return platforms;
}
