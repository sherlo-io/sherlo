import { describe, expect, it } from 'vitest';
import validateDevices from '../validateDevices';

const unknownDevice = {
  devices: [
    { id: 'pixel.70', osVersion: '13', locale: 'en_US', theme: 'light', fontScale: 'default' },
  ],
} as any;

describe('the devices a push tests on', () => {
  it("refuses a --devices device with the config's words, naming --devices in place of config", () => {
    expect(() => validateDevices(unknownDevice, '`--devices`')).toThrow(
      'Unknown device ID in `--devices`: "pixel.70"'
    );
    expect(() => validateDevices(unknownDevice)).toThrow('Unknown device ID in config: "pixel.70"');
  });
});
