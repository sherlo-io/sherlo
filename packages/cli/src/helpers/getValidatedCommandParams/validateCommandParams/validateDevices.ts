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
    const { id, osLocale, osVersion, osTheme, osFontScale, ...unsupportedProperties } =
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

    if (!osLocale) {
      throwError({
        type: 'unexpected',
        error: new Error('osLocale is undefined after normalization'),
      });
    }

    const osLocaleRegex = /^[a-z]{2}_[A-Z]{2}$/;
    // ^ - start of the string
    // [a-z]{2} - exactly two lowercase letters
    // _ - an underscore
    // [A-Z]{2} - exactly two uppercase letters
    // $ - end of the string

    if (!osLocaleRegex.test(osLocale)) {
      throwError(getError({ type: 'invalidOsLocale', osLocale }));
    }

    if (!osTheme) {
      throwError({
        type: 'unexpected',
        error: new Error('osTheme is undefined after normalization'),
      });
    }

    const deviceThemes: [DeviceTheme, DeviceTheme] = ['light', 'dark'];
    if (!deviceThemes.includes(osTheme)) {
      throwError(getError({ type: 'invalidOsTheme', osTheme }));
    }

    if (!osFontScale) {
      throwError({
        type: 'unexpected',
        error: new Error('osFontScale is undefined after normalization'),
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

    if (!deviceFontScaleLevels.includes(osFontScale)) {
      throwError(
        getError({
          type: 'invalidOsFontScale',
          osFontScale,
          platform,
          deviceFontScaleLevels,
        })
      );
    }

    Object.keys(unsupportedProperties).forEach((property) => {
      logWarning({
        message: `Unsupported device property \`${property}\` in config (supported: \`id\`, \`osVersion\`, \`osLocale\`, \`osTheme\`, \`osFontScale\`)`,
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
  | { type: 'invalidOsLocale'; osLocale: string }
  | { type: 'invalidOsTheme'; osTheme: string }
  | {
      type: 'invalidOsFontScale';
      osFontScale: string;
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
    case 'invalidOsLocale':
      return {
        message: `Invalid device locale "${error.osLocale}" in config. Expected format: xx_XX (example: en_US)`,
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'invalidOsTheme':
      return {
        message: `Invalid device theme "${error.osTheme}" in config. Expected: "light" or "dark"`,
        learnMoreLink: DOCS_LINK.configDevices,
      };
    case 'invalidOsFontScale':
      return {
        message: `Invalid font scale level "${error.osFontScale}" for ${
          PLATFORM_LABEL[error.platform]
        } device in config. Available levels: ${error.deviceFontScaleLevels
          .map((level) => `"${level}"`)
          .join(', ')}`,
        learnMoreLink: DOCS_LINK.configDevices,
      };
  }
}
