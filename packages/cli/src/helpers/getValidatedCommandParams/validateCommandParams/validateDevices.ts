import { DeviceTheme, Platform } from '@sherlo/api-types';
import { DEVICE_OS_FONT_SCALE, DEVICES, getPlatformFromDeviceId } from '@sherlo/shared';
import { DOCS_LINK, PLATFORM_LABEL } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import logWarning from '../../logWarning';
import throwError from '../../throwError';

function validateDevices(config: InvalidatedConfig): void {
  const { devices } = config;

  if (devices === undefined) {
    throwError(getError({ type: 'missingDevices' }));
  }

  if (!Array.isArray(devices) || devices.length === 0) {
    throwError(getError({ type: 'invalidDevices' }));
  }

  for (let i = 0; i < devices.length; i++) {
    const { id, locale, osVersion, theme, fontScale, ...unsupportedProperties } =
      devices[i] ?? {};

    if (!id || typeof id !== 'string' || !osVersion || typeof osVersion !== 'string') {
      throwError(getError({ type: 'requiredDeviceProps' }));
    }

    const sherloDevice = DEVICES[id];

    if (!sherloDevice) {
      throwError(getError({ type: 'unknownDeviceId', id }));
    }

    if (!sherloDevice.osVersions.some(({ version }) => version === osVersion)) {
      throwError(getError({ type: 'unsupportedOsVersion', id, osVersion }));
    }

    if (!locale) {
      throwError({
        type: 'unexpected',
        error: new Error('locale is undefined after normalization'),
      });
    }

    const localeRegex = /^[a-z]{2}_[A-Z]{2}$/;
    // ^ - start of the string
    // [a-z]{2} - exactly two lowercase letters
    // _ - an underscore
    // [A-Z]{2} - exactly two uppercase letters
    // $ - end of the string

    if (!localeRegex.test(locale)) {
      throwError(getError({ type: 'invalidlocale', locale }));
    }

    if (!theme) {
      throwError({
        type: 'unexpected',
        error: new Error('theme is undefined after normalization'),
      });
    }

    const deviceThemes: [DeviceTheme, DeviceTheme] = ['light', 'dark'];
    if (!deviceThemes.includes(theme)) {
      throwError(getError({ type: 'invalidtheme', theme }));
    }

    if (!fontScale) {
      throwError({
        type: 'unexpected',
        error: new Error('fontScale is undefined after normalization'),
      });
    }

    const platform = getPlatformFromDeviceId(id);
    const deviceFontScaleLevels = DEVICE_OS_FONT_SCALE[platform]
      ? Object.keys(DEVICE_OS_FONT_SCALE[platform]).sort((a, b) => {
          // Convert to numbers for proper ordering
          const numA = parseInt(a.replace('+', ''));
          const numB = parseInt(b.replace('+', ''));
          return numA - numB;
        })
      : [];

    if (!deviceFontScaleLevels.includes(fontScale)) {
      throwError(
        getError({
          type: 'invalidfontScale',
          fontScale,
          platform,
          deviceFontScaleLevels,
        })
      );
    }

    Object.keys(unsupportedProperties).forEach((property) => {
      logWarning({
        message: `Unsupported device property \`${property}\` in config (supported: \`id\`, \`osVersion\`, \`locale\`, \`theme\`, \`fontScale\`)`,
        learnMoreLink: DOCS_LINK.configDevices,
      });

      console.log();
    });
  }
}

export default validateDevices;

/* ========================================================================== */

type DeviceError =
  | { type: 'missingDevices' }
  | { type: 'invalidDevices' }
  | { type: 'requiredDeviceProps' }
  | { type: 'unknownDeviceId'; id: string }
  | { type: 'unsupportedOsVersion'; id: string; osVersion: string }
  | { type: 'invalidlocale'; locale: string }
  | { type: 'invalidtheme'; theme: string }
  | {
      type: 'invalidfontScale';
      fontScale: string;
      platform: Platform;
      deviceFontScaleLevels: string[];
    };

function getError(error: DeviceError) {
  switch (error.type) {
    case 'missingDevices':
      return {
        message: 'Missing required `devices` in config file',
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'invalidDevices':
      return {
        message: 'Config property `devices` must be a non-empty array',
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'requiredDeviceProps':
      return {
        message:
          'Each device in config must have required properties: `id` and `osVersion` as strings',
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'unknownDeviceId':
      return {
        message: `Unknown device ID in config: "${error.id}"`,
        learnMoreLink: DOCS_LINK.devices,
      };
    case 'unsupportedOsVersion':
      return {
        message: `Unsupported OS version "${error.osVersion}" for device "${error.id}" in config`,
        learnMoreLink: DOCS_LINK.devices,
      };
    case 'invalidlocale':
      return {
        message: `Invalid device locale "${error.locale}" in config. Expected format: xx_XX (example: en_US)`,
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'invalidtheme':
      return {
        message: `Invalid device theme "${error.theme}" in config. Expected: "light" or "dark"`,
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'invalidfontScale':
      return {
        message: `Invalid font scale level "${error.fontScale}" for ${
          PLATFORM_LABEL[error.platform]
        } device in config. Available levels: ${error.deviceFontScaleLevels
          .map((level) => `"${level}"`)
          .join(', ')}`,
        learnMoreLink: DOCS_LINK.configDevices,
      };
  }
}
