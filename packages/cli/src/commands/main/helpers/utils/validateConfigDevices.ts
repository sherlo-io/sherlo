import { DeviceTheme } from '@sherlo/api-types';
import { devices as sherloDevices } from '@sherlo/shared';
import { DOCS_LINK } from '../../../../constants';
import { logWarning } from '../../../../utils';
import { InvalidatedConfig } from '../../types';
import { throwConfigError } from '../../utils';

function validateConfigDevices(config: InvalidatedConfig): void {
  const { devices } = config;

  if (!devices || !Array.isArray(devices) || devices.length === 0) {
    throwConfigError('`devices` must be a non-empty array', DOCS_LINK.devices);
  }

  for (let i = 0; i < devices.length; i++) {
    const { id, osLocale, osVersion, osTheme, ...unsupportedProperties } = devices[i] ?? {};

    if (!id || typeof id !== 'string' || !osVersion || typeof osVersion !== 'string') {
      throwConfigError(
        'each device must have defined `id` and `osVersion` as strings',
        DOCS_LINK.devices
      );
    }

    const sherloDevice = sherloDevices[id];

    if (!sherloDevice) {
      throwConfigError(`device "${id}" is invalid`, DOCS_LINK.devices);
    }

    if (!sherloDevice.osVersions.some(({ version }) => version === osVersion)) {
      throwConfigError(
        `the osVersion "${osVersion}" is not supported by the device "${id}"`,
        DOCS_LINK.devices
      );
    }

    if (!osLocale) {
      throwConfigError('device `osLocale` must be defined', DOCS_LINK.configDevices);
    }

    const osLocaleRegex = /^[a-z]{2}(_[A-Z]{2})?$/;
    // ^ - start of the string
    // [a-z]{2} - exactly two lowercase letters
    // (- start of a group
    // _ - an underscore
    // [A-Z]{2} - exactly two uppercase letters
    // )? - end of the group, ? makes this group optional
    // $ - end of the string

    if (!osLocaleRegex.test(osLocale)) {
      throwConfigError(`device osLocale "${osLocale}" is invalid`, DOCS_LINK.configDevices);
    }

    if (!osTheme) {
      throwConfigError('device `osTheme` must be defined', DOCS_LINK.configDevices);
    }

    const deviceThemes: [DeviceTheme, DeviceTheme] = ['light', 'dark'];
    if (!deviceThemes.includes(osTheme)) {
      throwConfigError(`device osTheme "${osTheme}" is invalid`, DOCS_LINK.configDevices);
    }

    Object.keys(unsupportedProperties).forEach((property) => {
      logWarning({
        type: 'config',
        message: `device property "${property}" is not supported`,
        learnMoreLink: DOCS_LINK.configDevices,
      });
    });
  }
}

export default validateConfigDevices;
