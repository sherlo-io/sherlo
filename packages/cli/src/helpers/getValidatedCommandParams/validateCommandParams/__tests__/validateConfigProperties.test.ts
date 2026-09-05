/**
 * Tests for validateConfigProperties - the config-file property allow-list.
 *
 * `include` and `exclude` are supported config properties (SHERLO-1952): both
 * are honoured end to end (parseConfigFile normalises them, getBuildRunConfig
 * forwards them), so warning about them was a pure false positive. These tests
 * pin that they no longer warn, that a genuinely unknown property still does,
 * and that the warning's supported-list text advertises the two new properties.
 */
import chalk from 'chalk';
chalk.level = 0;

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import validateConfigProperties from '../validateConfigProperties';

describe('validateConfigProperties', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function warnings(): string[] {
    return logSpy.mock.calls
      .map((call: unknown[]) => String(call[0] ?? ''))
      .filter((line: string) => line.includes('WARNING'));
  }

  // The regression this ticket exists for: a config carrying include/exclude
  // must NOT warn, because the CLI honours both.
  it('does NOT warn for a config carrying `include` and `exclude`', () => {
    validateConfigProperties({
      token: 'abc',
      devices: [],
      include: ['My Story'],
      exclude: ['Other Story'],
    } as any);

    expect(warnings()).toEqual([]);
  });

  it('does NOT warn for any of the supported properties together', () => {
    validateConfigProperties({
      token: 'abc',
      android: 'app.apk',
      ios: 'app.app',
      devices: [],
      include: ['a'],
      exclude: ['b'],
    } as any);

    expect(warnings()).toEqual([]);
  });

  // `staged.fullBuild` configured the removed `test:bundled --on-stale=build`
  // fallback. Nothing reads it any more, so a config that still carries it must
  // be told - silently accepting a block the CLI ignores is the worse failure.
  it('warns for the removed `staged` block', () => {
    validateConfigProperties({ token: 'abc', staged: {} } as any);

    const warned = warnings();
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain('Unsupported property `staged` in config file');
  });

  it('still warns for a genuinely unknown property', () => {
    validateConfigProperties({ token: 'abc', bogus: true } as any);

    const warned = warnings();
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain('Unsupported property `bogus` in config file');
  });

  // The supported-list text the warning prints must now advertise the two new
  // properties, so a user who mistypes one is pointed at the right names.
  it("lists `include` and `exclude` in the warning's supported-property text", () => {
    validateConfigProperties({ bogus: true } as any);

    const warned = warnings();
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain('`include`');
    expect(warned[0]).toContain('`exclude`');
  });
});
