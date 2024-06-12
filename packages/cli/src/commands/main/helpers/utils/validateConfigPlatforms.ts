import { Platform } from '@sherlo/api-types';
import { docsLink } from '../../constants';
import { getErrorMessage } from '../../utils';
import { ConfigMode, InvalidatedConfig } from '../../types';
import getConfigErrorMessage from './getConfigErrorMessage';
import validateConfigPlatformPath from './validateConfigPlatformPath';

function validateConfigPlatforms(config: InvalidatedConfig, mode: ConfigMode): void {
  const { android, ios } = config;

  if (!android && !ios) {
    throw new Error(
      getConfigErrorMessage('at least one platform must be defined', docsLink.configApps)
    );
  }

  if (android) validatePlatform(config, 'android', mode);

  if (ios) validatePlatform(config, 'ios', mode);
}

export default validateConfigPlatforms;

/* ========================================================================== */

function validatePlatform(config: InvalidatedConfig, platform: Platform, mode: ConfigMode): void {
  validatePlatformSpecificParameters(config, platform);

  if (mode === 'withPaths') {
    validateConfigPlatformPath(config[platform]?.path, platform);
  }
}

function validatePlatformSpecificParameters(config: InvalidatedConfig, platform: Platform): void {
  if (platform === 'android') {
    const { android } = config;
    if (!android) {
      throw new Error(
        getErrorMessage({
          type: 'unexpected',
          message: 'android should be defined',
        })
      );
    }

    if (android.activity && typeof android.activity !== 'string') {
      throw new Error(
        getConfigErrorMessage(
          'for android, if activity is defined, it must be a string',
          docsLink.configAndroid
        )
      );
    }
  } else if (platform === 'ios') {
    const { ios } = config;
    if (!ios) {
      throw new Error(
        getErrorMessage({
          type: 'unexpected',
          message: 'ios should be defined',
        })
      );
    }
  }
}
