import fs from 'fs';
import path from 'path';
import { Platform, deviceLocaleValues, deviceThemeValues } from '@sherlo/api-types';
import { devices, projectApiTokenLength, teamIdLength } from '@sherlo/shared';
import { InvalidatedConfig } from '../../types';
import getErrorMessage from '../getErrorMessage';
import getProjectTokenParts from '../getProjectTokenParts';
import getConfigErrorMessage from './getConfigErrorMessage';

const learnMoreLink: {
  [type in Platform | 'token' | 'devices' | 'include' | 'exclude']: string;
} = {
  token: 'https://docs.sherlo.io/getting-started/config#project-token',
  android: 'https://docs.sherlo.io/getting-started/config#android',
  ios: 'https://docs.sherlo.io/getting-started/config#ios',
  // TODO: update
  devices: 'https://docs.sherlo.io/getting-started/config',
  // TODO: update
  include: 'https://docs.sherlo.io/getting-started/config',
  // TODO: update
  exclude: 'https://docs.sherlo.io/getting-started/config',
};

export function validateProjectToken(token: InvalidatedConfig['token']): token is string {
  if (!token || typeof token !== 'string') {
    throw new Error(getConfigErrorMessage('token must be defined string', learnMoreLink.token));
  }

  const { apiToken, projectIndex, teamId } = getProjectTokenParts(token);

  if (
    apiToken.length !== projectApiTokenLength ||
    teamId.length !== teamIdLength ||
    !Number.isInteger(projectIndex) ||
    projectIndex < 1
  ) {
    throw new Error(getConfigErrorMessage('token is not valid', learnMoreLink.token));
  }

  return true;
}

export function validatePlatforms(config: InvalidatedConfig, withoutPaths?: boolean): void {
  const { android, ios } = config;

  if (!android && !ios) {
    throw new Error(getConfigErrorMessage('at least one of the platforms must be defined'));
  }

  if (android) validatePlatform(config, 'android', withoutPaths);

  if (ios) validatePlatform(config, 'ios', withoutPaths);
}

function validatePlatform(
  config: InvalidatedConfig,
  platform: Platform,
  withoutPaths?: boolean
): void {
  validatePlatformSpecificParameters(config, platform);

  if (!withoutPaths) {
    validatePlatformPath(config[platform]?.path, platform);
  }

  validatePlatformDevices(config, platform);
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

    if (
      !android.packageName ||
      typeof android.packageName !== 'string' ||
      !android.packageName.includes('.')
    ) {
      throw new Error(
        getConfigErrorMessage(
          'for android, packageName must be a valid string',
          learnMoreLink.android
        )
      );
    }

    if (android.activity && typeof android.activity !== 'string') {
      throw new Error(
        getConfigErrorMessage(
          'for android, if activity is defined, it must be a string',
          learnMoreLink.android
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

    if (
      !ios.bundleIdentifier ||
      typeof ios.bundleIdentifier !== 'string' ||
      !ios.bundleIdentifier.includes('.')
    ) {
      throw new Error(
        getConfigErrorMessage('for ios, bundleIdentifier must be a valid string', learnMoreLink.ios)
      );
    }
  }
}

export function validatePlatformPath(platformPath: string | undefined, platform: Platform): void {
  if (!platformPath || typeof platformPath !== 'string') {
    throw new Error(
      getConfigErrorMessage(`for ${platform}, path must be defined string`, learnMoreLink[platform])
    );
  }

  const fileType: { [platformName in Platform]: string[] } = {
    android: ['.apk'],
    ios: ['.app', '.gz'],
  };

  if (!fs.existsSync(platformPath) || !fileType[platform].includes(path.extname(platformPath))) {
    throw new Error(
      getConfigErrorMessage(
        `for ${platform}, path must be a valid ${fileType[platform].join(', ')} file`,
        learnMoreLink[platform]
      )
    );
  }
}

function validatePlatformDevices(config: InvalidatedConfig, platform: Platform): void {
  const { devices: platformDevices } = config[platform] ?? {};

  if (!platformDevices || !Array.isArray(platformDevices) || platformDevices.length === 0) {
    throw new Error(
      getConfigErrorMessage(
        `for ${platform}, devices must be a non-empty array`,
        learnMoreLink.devices
      )
    );
  }

  for (let i = 0; i < platformDevices.length; i++) {
    const { id, locale, osVersion, theme } = platformDevices[i] ?? {};

    if (!id || !osVersion) {
      throw new Error(
        getConfigErrorMessage(
          `for ${platform}, each device must have defined id and osVersion`,
          learnMoreLink.devices
        )
      );
    }

    const device = devices[id];

    if (!device || device.os !== platform) {
      throw new Error(
        getConfigErrorMessage(`for ${platform}, device "${id}" is invalid`, learnMoreLink.devices)
      );
    }

    if (!device.osVersions.some(({ version }) => version === osVersion)) {
      throw new Error(
        getConfigErrorMessage(
          `for ${platform}, the osVersion "${osVersion}" is not supported by the device "${id}"`,
          learnMoreLink.devices
        )
      );
    }

    if (!locale || !deviceLocaleValues.includes(locale)) {
      throw new Error(
        getConfigErrorMessage(`the locale "${locale}" is not supported`, learnMoreLink.devices)
      );
    }

    if (!theme || !deviceThemeValues.includes(theme)) {
      throw new Error(
        getConfigErrorMessage(`the theme "${theme}" is not supported`, learnMoreLink.devices)
      );
    }
  }
}

export function validateFilters(config: InvalidatedConfig): void {
  const { exclude, include } = config;

  if (include && !isArrayOfStrings(include)) {
    throw new Error(getConfigErrorMessage('include is invalid', learnMoreLink.include));
  }

  if (exclude && !isArrayOfStrings(exclude)) {
    throw new Error(getConfigErrorMessage('exclude is invalid', learnMoreLink.exclude));
  }
}

function isArrayOfStrings(arr: unknown): boolean {
  if (!Array.isArray(arr)) {
    // not an array
    return false;
  }

  if (arr.length === 0) {
    // array is empty
    return false;
  }

  // all items are strings
  return arr.every((item) => typeof item === 'string');
}
