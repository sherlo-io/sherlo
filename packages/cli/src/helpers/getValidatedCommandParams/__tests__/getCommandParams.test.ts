/**
 * Tests for getCommandParams - the config x CLI-options merge.
 *
 * Pins the config-vs-flag precedence for `include` and `exclude` (SHERLO-1952).
 * The merge is `{ ...config, ...options }`, so a passed CLI flag lands AFTER the
 * config value and REPLACES it wholesale (never merges). `--include` is a real
 * flag, so it can override the config's `include`; there is no `--exclude` flag,
 * so `exclude` only ever comes from the config. When a flag is not passed its key
 * is absent from options (commander omits un-passed options), so the config value
 * survives.
 */
import { DEVICES } from '@sherlo/shared';
import { describe, expect, it } from 'vitest';
import { renderPlatformUnknown } from '../../../render/appBuild';
import getCommandParams from '../getCommandParams';

// Minimal options: only what getCommandParams reads (projectRoot for the
// android/ios path.resolve). Commander omits keys for flags that were not
// passed, so an absent flag is modelled as a missing key, not `undefined`.
function options(overrides: Record<string, unknown> = {}): any {
  return { projectRoot: '/proj', ...overrides };
}

describe('getCommandParams --platform', () => {
  const deviceIdOn = (os: string) =>
    Object.keys(DEVICES).find((id) => (DEVICES as Record<string, { os: string }>)[id].os === os);
  const config = {
    devices: [{ id: deviceIdOn('android') }, { id: deviceIdOn('ios') }],
  } as any;

  it('refuses a --platform that is neither android nor ios, naming the two', () => {
    for (const platform of ['both', 'Android', '']) {
      expect(() => getCommandParams(options({ platform }), config)).toThrow(
        renderPlatformUnknown(platform).message
      );
    }
    expect(renderPlatformUnknown('both').message).toContain('`android` or `ios`');
  });

  it("a --platform job keeps the config's whole device list beside its own", () => {
    const result = getCommandParams(options({ platform: 'ios' }), config);

    expect(result.devices).toEqual([config.devices[1]]);
    expect(result.testDevices).toEqual(config.devices);
  });
});

describe('getCommandParams include/exclude precedence', () => {
  describe('include', () => {
    it('uses the config value when no --include flag is passed', () => {
      const result = getCommandParams(options(), { include: ['FromConfig'] } as any);
      expect(result.include).toEqual(['FromConfig']);
    });

    it('the --include flag REPLACES the config value (no merge)', () => {
      const result = getCommandParams(options({ include: ['FromFlag'] }), {
        include: ['FromConfig'],
      } as any);
      expect(result.include).toEqual(['FromFlag']);
    });

    it('uses the --include flag when the config has no include', () => {
      const result = getCommandParams(options({ include: ['FromFlag'] }), {} as any);
      expect(result.include).toEqual(['FromFlag']);
    });
  });

  describe('exclude', () => {
    // There is no --exclude CLI flag, so the config is exclude's only source; it
    // flows through the merge untouched.
    it('uses the config value (there is no --exclude flag to override it)', () => {
      const result = getCommandParams(options(), { exclude: ['FromConfig'] } as any);
      expect(result.exclude).toEqual(['FromConfig']);
    });
  });
});
