/**
 * Tests for askTheStagedGate.ts - the staged road's questions to the service's gate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCheckStagedGate } = vi.hoisted(() => ({ mockCheckStagedGate: vi.fn() }));

vi.mock('../../../seams/serverCalls', () => ({
  serverCalls: () => ({ checkStagedGate: mockCheckStagedGate }),
}));
vi.mock('../../../helpers', () => ({
  handleClientError: vi.fn((error: unknown) => {
    throw error;
  }),
  reporting: { addBreadcrumb: vi.fn() },
}));
vi.mock('../appBuild/buildSettings', () => ({ buildSettingsDigest: () => 'digest' }));

import { checkGate } from '../askTheStagedGate';

const ask = (sameCode?: Parameters<typeof checkGate>[0]['sameCode']) =>
  checkGate({
    token: 'token',
    platformsToTest: ['ios', 'android'],
    baseFingerprints: { ios: 'fp-ios', android: 'fp-android' },
    buildSettings: {} as any,
    gateMetadata: () => ({ derivedFrom: 'none' }),
    sameCode,
    projectIndex: 1,
    teamId: 'team',
  });

describe('asking the staged gate', () => {
  beforeEach(() => {
    mockCheckStagedGate.mockReset();
  });

  it('sends each platform its own bundle hash and the branch, and collects the same-code test index', async () => {
    mockCheckStagedGate
      .mockResolvedValueOnce({ outcome: 'fast', diff: [], sameCodeBuildIndex: 4 })
      .mockResolvedValueOnce({ outcome: 'fast', diff: [] });

    const answers = await ask({
      gitBranch: 'main',
      bundleHashOf: (platform) => `hash-${platform}`,
      devicesOf: (platform) => [{ id: `device-${platform}` } as any],
    });

    expect(mockCheckStagedGate.mock.calls[0][0]).toMatchObject({
      platform: 'ios',
      bundleHash: 'hash-ios',
      gitBranch: 'main',
      devices: [{ id: 'device-ios' }],
    });
    expect(mockCheckStagedGate.mock.calls[1][0]).toMatchObject({
      devices: [{ id: 'device-android' }],
    });
    expect(mockCheckStagedGate.mock.calls[1][0]).toMatchObject({ bundleHash: 'hash-android' });
    expect(answers.sameCodeBuildIndexOf).toEqual({ ios: 4 });
    expect(answers.refusals).toEqual([]);
  });

  it('sends no bundle hash and no branch when the caller names none', async () => {
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });

    await ask();

    expect(mockCheckStagedGate.mock.calls[0][0]).not.toHaveProperty('bundleHash');
    expect(mockCheckStagedGate.mock.calls[0][0]).not.toHaveProperty('gitBranch');
  });

  it('a config with no include or exclude sends empty lists', async () => {
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });

    await ask({ gitBranch: 'main', bundleHashOf: () => 'hash', devicesOf: () => undefined });

    expect(mockCheckStagedGate.mock.calls[0][0]).toMatchObject({ include: [], exclude: [] });
  });

  it('the same-code question carries the test scope', async () => {
    mockCheckStagedGate.mockResolvedValue({ outcome: 'fast', diff: [] });

    await ask({
      gitBranch: 'main',
      bundleHashOf: () => 'hash',
      devicesOf: () => undefined,
      include: ['Storefront/*'],
      exclude: ['Storefront/CheckoutScreen'],
    });

    expect(mockCheckStagedGate.mock.calls[0][0]).toMatchObject({
      include: ['Storefront/*'],
      exclude: ['Storefront/CheckoutScreen'],
    });
  });
});
