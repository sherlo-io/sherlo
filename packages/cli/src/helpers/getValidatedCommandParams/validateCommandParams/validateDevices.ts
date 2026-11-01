import { DeviceTheme, Platform } from '@sherlo/api-types';
import { DEVICE_OS_FONT_SCALE, DEVICES, getPlatformFromDeviceId } from '@sherlo/shared';
import { DEVICES_OPTION_LABEL, DOCS_LINK, PLATFORM_LABEL } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import logWarning from '../../logWarning';
import throwError from '../../throwError';

/**
 * Where the devices came from, as a refusal names it: the config file, or `--devices`, which stands
 * in for the config's devices for one run and is checked in the same words.
 */
export type DevicesSource = 'config' | typeof DEVICES_OPTION_LABEL;

function validateDevices(config: InvalidatedConfig, where: DevicesSource = 'config'): void {
  const { devices } = config;

  if (devices === undefined) {
    throwError(getError(where, { type: 'missingDevices' }));
  }

  if (!Array.isArray(devices) || devices.length === 0) {
    throwError(getError(where, { type: 'invalidDevices' }));
  }

  for (let i = 0; i < devices.length; i++) {
    const { id, locale, osVersion, theme, fontScale, ...unsupportedProperties } = devices[i] ?? {};

    if (!id || typeof id !== 'string' || !osVersion || typeof osVersion !== 'string') {
      throwError(getError(where, { type: 'requiredDeviceProps' }));
    }

    const sherloDevice = DEVICES[id];

    if (!sherloDevice) {
      throwError(getError(where, { type: 'unknownDeviceId', id }));
    }

    if (!sherloDevice.osVersions.some(({ version }) => version === osVersion)) {
      throwError(getError(where, { type: 'unsupportedOsVersion', id, osVersion }));
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
      throwError(getError(where, { type: 'invalidlocale', locale }));
    }

    if (!theme) {
      throwError({
        type: 'unexpected',
        error: new Error('theme is undefined after normalization'),
      });
    }

    const deviceThemes: [DeviceTheme, DeviceTheme] = ['light', 'dark'];
    if (!deviceThemes.includes(theme)) {
      throwError(getError(where, { type: 'invalidtheme', theme }));
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
          const numA = parseInt(a.replace('+', ''), 10);
          const numB = parseInt(b.replace('+', ''), 10);
          return numA - numB;
        })
      : [];

    if (!deviceFontScaleLevels.includes(fontScale)) {
      throwError(
        getError(where, {
          type: 'invalidfontScale',
          fontScale,
          platform,
          deviceFontScaleLevels,
        })
      );
    }

    Object.keys(unsupportedProperties).forEach((property) => {
      logWarning({
        message: `Unsupported device property \`${property}\` in ${where} (supported: \`id\`, \`osVersion\`, \`locale\`, \`theme\`, \`fontScale\`)`,
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

function getError(where: DevicesSource, error: DeviceError) {
  switch (error.type) {
    case 'missingDevices':
      return {
        message: 'Missing required `devices` in config file',
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'invalidDevices':
      return {
        message:
          where === 'config'
            ? 'Config property `devices` must be a non-empty array'
            : `${where} must be a non-empty array`,
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'requiredDeviceProps':
      return {
        message: `Each device in ${where} must have required properties: \`id\` and \`osVersion\` as strings`,
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'unknownDeviceId':
      return {
        message: `Unknown device ID in ${where}: "${error.id}"`,
        learnMoreLink: DOCS_LINK.devices,
      };
    case 'unsupportedOsVersion':
      return {
        message: `Unsupported OS version "${error.osVersion}" for device "${error.id}" in ${where}`,
        learnMoreLink: DOCS_LINK.devices,
      };
    case 'invalidlocale':
      return {
        message: `Invalid device locale "${error.locale}" in ${where}. Expected format: xx_XX (example: en_US)`,
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'invalidtheme':
      return {
        message: `Invalid device theme "${error.theme}" in ${where}. Expected: "light" or "dark"`,
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'invalidfontScale':
      return {
        message: `Invalid font scale level "${error.fontScale}" for ${
          PLATFORM_LABEL[error.platform]
        } device in ${where}. Available levels: ${error.deviceFontScaleLevels
          .map((level) => `"${level}"`)
          .join(', ')}`,
        learnMoreLink: DOCS_LINK.configDevices,
      };
  }
}
