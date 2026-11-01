/**
 * Tests for getCommandParams - the config x CLI-options merge.
 *
 * The run's scope (`--include`, `--exclude`, `--devices`) is laid over the config once, in
 * getNormalizedConfig (its test pins it); here the config's scope is only carried through.
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
