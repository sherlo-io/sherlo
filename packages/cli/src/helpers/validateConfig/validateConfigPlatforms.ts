import { Platform } from '@sherlo/api-types';
import { DOCS_LINK } from '../../constants';
import { ConfigMode, InvalidatedConfig } from '../../types';
import throwConfigError from '../throwConfigError';
import validateConfigPlatformPath from './validateConfigPlatformPath';

function validateConfigPlatforms(config: InvalidatedConfig, configMode: ConfigMode): void {
  const { android, ios } = config;

  if (configMode === 'withBuildPaths' && !android && !ios) {
    throwConfigError('at least one platform build path must be defined', DOCS_LINK.config);
  }

  if (android) validatePlatform(config, 'android', configMode);

  if (ios) validatePlatform(config, 'ios', configMode);
}

export default validateConfigPlatforms;

/* ========================================================================== */

function validatePlatform(
  config: InvalidatedConfig,
  platform: Platform,
  configMode: ConfigMode
): void {
  // validatePlatformSpecificParameters(config, platform);

  if (configMode === 'withBuildPaths') {
    validateConfigPlatformPath(config[platform], platform);
  }
}

// function validatePlatformSpecificParameters(config: InvalidatedConfig, platform: Platform): void {
//   if (platform === 'android') {
//     const { android } = config;
//     if (!android) {
//         throwError({
//           type: 'unexpected',
//           message: 'android should be defined',
//         })
//     }

//     if (
//       !android.packageName ||
//       typeof android.packageName !== 'string' ||
//       !android.packageName.includes('.')
//     ) {
//         throwConfigError(
//           'for android, packageName must be a valid string',
//           docsLink.configAndroid
//         )
//     }

//     if (android.activity && typeof android.activity !== 'string') {
//         throwConfigError(
//           'for android, if activity is defined, it must be a string',
//           docsLink.configAndroid
//         )
//     }
//   } else if (platform === 'ios') {
//     const { ios } = config;
//     if (!ios) {
//         throwError({
//           type: 'unexpected',
//           message: 'ios should be defined',
//         })
//     }

//     if (
//       !ios.bundleIdentifier ||
//       typeof ios.bundleIdentifier !== 'string' ||
//       !ios.bundleIdentifier.includes('.')
//     ) {
//         throwConfigError(
//           'for ios, bundleIdentifier must be a valid string',
//           docsLink.configIos
//         )
//     }
//   }
// }
