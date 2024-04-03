import { Platform } from '@sherlo/api-types';
import { docsLink } from '../../constants';
import { getErrorMessage } from '../../utils';
import { ConfigMode, InvalidatedConfig } from '../../types';
import getConfigErrorMessage from './getConfigErrorMessage';
import validateConfigPlatformPath from './validateConfigPlatformPath';

export function validateConfigPlatforms(config: InvalidatedConfig, mode: ConfigMode): void {
  const { android, ios } = config.apps ?? {};

  if (!android && !ios) {
    throw new Error(getConfigErrorMessage('at least one platform must be defined', docsLink.apps));
  }

  if (android) validatePlatform(config, 'android', mode);

  if (ios) validatePlatform(config, 'ios', mode);
}

function validatePlatform(config: InvalidatedConfig, platform: Platform, mode: ConfigMode): void {
  validatePlatformSpecificParameters(config, platform);

  if (mode === 'withPaths') {
    validateConfigPlatformPath(config?.apps?.[platform]?.path, platform);
  }
}

function validatePlatformSpecificParameters(config: InvalidatedConfig, platform: Platform): void {
  if (platform === 'android') {
    const { android } = config.apps ?? {};
    if (!android) {
      throw new Error(
        getErrorMessage({
          type: 'unexpected',
          message: 'android should be defined',
        })
      );
    }

    if (
      !android.packageName ||
      typeof android.packageName !== 'string' ||
      !android.packageName.includes('.')
    ) {
      throw new Error(
        getConfigErrorMessage('for android, packageName must be a valid string', docsLink.android)
      );
    }

    if (android.activity && typeof android.activity !== 'string') {
      throw new Error(
        getConfigErrorMessage(
          'for android, if activity is defined, it must be a string',
          docsLink.android
        )
      );
    }
  } else if (platform === 'ios') {
    const { ios } = config.apps ?? {};
    if (!ios) {
      throw new Error(
        getErrorMessage({
          type: 'unexpected',
          message: 'ios should be defined',
        })
      );
    }

    if (
      !ios.bundleIdentifier ||
      typeof ios.bundleIdentifier !== 'string' ||
      !ios.bundleIdentifier.includes('.')
    ) {
      throw new Error(
        getConfigErrorMessage('for ios, bundleIdentifier must be a valid string', docsLink.ios)
      );
    }
  }
}

export default validateConfigPlatforms;
