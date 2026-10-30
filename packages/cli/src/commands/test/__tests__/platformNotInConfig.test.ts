import { DEVICES } from '@sherlo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEmit, mockGetNormalizedConfig, mockServerCalls } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
  mockGetNormalizedConfig: vi.fn(),
  mockServerCalls: vi.fn(),
}));

vi.mock('../../../helpers/transcriptSink', () => ({ emit: mockEmit }));
vi.mock('../../../helpers/getValidatedCommandParams/getNormalizedConfig', () => ({
  default: mockGetNormalizedConfig,
}));
vi.mock('../../../helpers/getValidatedCommandParams/getNormalizedOptions', () => ({
  default: (options: object) => options,
}));
vi.mock('../../../helpers/getValidatedCommandParams/getOptionsWithDefaults', () => ({
  default: (options: object) => options,
}));
// No call to the service may happen here: the seam is watched and must stay untouched.
vi.mock('../../../seams/serverCalls', () => ({ serverCalls: mockServerCalls }));

import { renderPlatformRow } from '../../../render/runRows';
import { endsAsPlatformNotInConfig } from '../platformNotInConfig';

const deviceIdOn = (os: string) =>
  Object.keys(DEVICES).find((id) => (DEVICES as Record<string, { os: string }>)[id].os === os);

beforeEach(() => vi.clearAllMocks());

describe('a --platform job whose platform the config does not test', () => {
  it('a --platform job whose config names no device of its platform prints one line and exits 0, before any credential or call', () => {
    mockGetNormalizedConfig.mockReturnValue({ devices: [{ id: deviceIdOn('android') }] });

    const ends = endsAsPlatformNotInConfig({ platform: 'ios' } as any);

    expect(ends).toBe(true);
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith({
      kind: 'platform-row',
      row: { platform: 'ios', appBuild: 'skipped-not-in-config' },
    });
    expect(mockServerCalls).not.toHaveBeenCalled();
  });

  it('a --platform job whose config names no devices at all is refused, not ended green', () => {
    mockGetNormalizedConfig.mockReturnValue({ devices: [] });

    const ends = endsAsPlatformNotInConfig({ platform: 'ios' } as any);

    // It does not end here: the ordinary checks go on and refuse the empty device list.
    expect(ends).toBe(false);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('a --platform job whose --devices names no phone of its platform prints Skipped: --devices lists no device of it and exits 0', () => {
    mockGetNormalizedConfig.mockReturnValue({ devices: [{ id: deviceIdOn('android') }] });

    const ends = endsAsPlatformNotInConfig({ platform: 'ios', devices: [{}] } as any);

    expect(ends).toBe(true);
    expect(mockEmit).toHaveBeenCalledWith({
      kind: 'platform-row',
      row: { platform: 'ios', appBuild: 'skipped-not-in-config', devicesFromOption: true },
    });
    expect(renderPlatformRow(mockEmit.mock.calls[0][0].row).join('\n')).toContain(
      'Skipped: --devices lists no iOS device'
    );
  });
});
