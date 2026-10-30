import {
  DEFAULT_DEVICE_OS_FONT_SCALE,
  DEFAULT_DEVICE_OS_LOCALE,
  DEFAULT_DEVICE_OS_THEME,
} from '@sherlo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockParseConfigFile } = vi.hoisted(() => ({ mockParseConfigFile: vi.fn() }));

vi.mock('../parseConfigFile', () => ({ default: mockParseConfigFile }));
vi.mock('../resolveConfigPath', () => ({ default: () => '/proj/sherlo.config.json' }));

import getNormalizedConfig from '../getNormalizedConfig';

const configDevice = { id: 'pixel.7', osVersion: '13' };

function read(options: Record<string, unknown>) {
  return getNormalizedConfig(options as any);
}

beforeEach(() => {
  mockParseConfigFile.mockReturnValue({
    include: ['FromConfig'],
    exclude: ['ExcludedByConfig'],
    devices: [configDevice],
  });
});

describe('the config a push reads, with the run scope from its options', () => {
  it('uses the config value when no --include flag is passed', () => {
    expect(read({}).include).toEqual(['FromConfig']);
  });

  it('the --include flag REPLACES the config value (no merge)', () => {
    expect(read({ include: ['FromFlag'] }).include).toEqual(['FromFlag']);
  });

  it('uses the --include flag when the config has no include', () => {
    mockParseConfigFile.mockReturnValue({ devices: [configDevice] });

    expect(read({ include: ['FromFlag'] }).include).toEqual(['FromFlag']);
  });

  it('the --exclude flag REPLACES the config value (no merge)', () => {
    expect(read({ exclude: ['ExcludedByFlag'] }).exclude).toEqual(['ExcludedByFlag']);
    expect(read({}).exclude).toEqual(['ExcludedByConfig']);
  });

  it("the --devices flag REPLACES the config's devices (no merge)", () => {
    const devices = read({ devices: [{ id: 'iphone.15', osVersion: '17' }] }).devices;

    expect(devices).toHaveLength(1);
    expect(devices?.[0]).toMatchObject({ id: 'iphone.15' });
  });

  it('a --devices device gets the same defaults as a config device', () => {
    const fromFlag = read({ devices: [configDevice] }).devices;
    const fromConfig = read({}).devices;

    expect(fromFlag).toEqual(fromConfig);
    expect(fromFlag?.[0]).toMatchObject({
      locale: DEFAULT_DEVICE_OS_LOCALE,
      theme: DEFAULT_DEVICE_OS_THEME,
      fontScale: DEFAULT_DEVICE_OS_FONT_SCALE,
    });
  });
});
