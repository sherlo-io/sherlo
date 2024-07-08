import { DeviceTheme } from '@sherlo/api-types';
import { devices as sherloDevices } from '@sherlo/shared';
import { DOCS_LINK } from '../../constants';
import { InvalidatedConfig } from '../../types';
import { getConfigErrorMessage } from '../../utils';

function validateConfigDevices(config: InvalidatedConfig): void {
  const { devices } = config;

  if (!devices || !Array.isArray(devices) || devices.length === 0) {
    throw new Error(
      getConfigErrorMessage('`devices` must be a non-empty array', DOCS_LINK.devices)
    );
  }

  for (let i = 0; i < devices.length; i++) {
    const { id, osLanguage, osVersion, osTheme, ...rest } = devices[i] ?? {};

    if (!id || typeof id !== 'string' || !osVersion || typeof osVersion !== 'string') {
      throw new Error(
        getConfigErrorMessage(
          'each device must have defined `id` and `osVersion` as strings',
          DOCS_LINK.devices
        )
      );
    }

    const sherloDevice = sherloDevices[id];

    if (!sherloDevice) {
      throw new Error(getConfigErrorMessage(`device "${id}" is invalid`, DOCS_LINK.devices));
    }

    if (!sherloDevice.osVersions.some(({ version }) => version === osVersion)) {
      throw new Error(
        getConfigErrorMessage(
          `the osVersion "${osVersion}" is not supported by the device "${id}"`,
          DOCS_LINK.devices
        )
      );
    }

    if (!osLanguage) {
      throw new Error(
        getConfigErrorMessage('device `osLanguage` must be defined', DOCS_LINK.configDevices)
      );
    }

    const osLanguageRegex = /^[a-z]{2}(_[A-Z]{2})?$/;
    // ^ - start of the string
    // [a-z]{2} - exactly two lowercase letters
    // (- start of a group
    // _ - an underscore
    // [A-Z]{2} - exactly two uppercase letters
    // )? - end of the group, ? makes this group optional
    // $ - end of the string

    if (!osLanguageRegex.test(osLanguage)) {
      throw new Error(
        getConfigErrorMessage(
          `device osLanguage "${osLanguage}" is invalid`,
          DOCS_LINK.configDevices
        )
      );
    }

    if (!osTheme) {
      throw new Error(
        getConfigErrorMessage('device `osTheme` must be defined', DOCS_LINK.configDevices)
      );
    }

    const deviceThemes: [DeviceTheme, DeviceTheme] = ['light', 'dark'];
    if (!deviceThemes.includes(osTheme)) {
      throw new Error(
        getConfigErrorMessage(`device osTheme "${osTheme}" is invalid`, DOCS_LINK.configDevices)
      );
    }

    if (Object.keys(rest).length > 0) {
      throw new Error(
        getConfigErrorMessage(
          `device property "${Object.keys(rest)[0]}" is not supported`,
          DOCS_LINK.configDevices
        )
      );
    }
  }
}

export default validateConfigDevices;
