import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bundleFor: vi.fn(),
  stageTheModuleMap: vi.fn(),
  logWarning: vi.fn(),
}));

vi.mock('../../seams/bundler', () => ({ bundler: () => ({ bundleFor: mocks.bundleFor }) }));
vi.mock('../../commands/test/stageTheModuleMap', () => ({
  stageTheModuleMap: mocks.stageTheModuleMap,
}));
vi.mock('../logWarning', () => ({ default: mocks.logWarning }));

import { stageModuleMapsOfBuiltApps } from '../stageModuleMapsOfBuiltApps';

const COMMAND_PARAMS = {
  projectRoot: '/proj',
  buildSettings: { env: { A: '1' } },
  credential: { token: 'tok', projectIndex: 4, teamId: 'team' },
} as never;
const FINGERPRINTS = { ios: { debugMessage: 'no lockfile' }, android: {} } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the module map of an app built here with no fingerprint', () => {
  it('bundles each platform with the build settings and writes its staged key into the config', async () => {
    mocks.bundleFor.mockResolvedValue({ moduleManifest: { raw: Buffer.from('{}') } });
    mocks.stageTheModuleMap.mockResolvedValue('ios-key');
    const buildRunConfig: { ios: { manifestS3Key?: string } } = { ios: {} };

    await stageModuleMapsOfBuiltApps({
      platforms: ['ios'],
      fingerprints: FINGERPRINTS,
      buildRunConfig,
      commandParams: COMMAND_PARAMS,
    });

    expect(mocks.bundleFor).toHaveBeenCalledWith('/proj', 'ios', { env: { A: '1' } });
    expect(buildRunConfig.ios.manifestS3Key).toBe('ios-key');
    expect(mocks.logWarning).toHaveBeenCalledWith({
      message: expect.stringContaining('Fingerprint skipped - no lockfile'),
    });
  });

  it('does nothing, not even a warning, when no platform was built without a fingerprint', async () => {
    await stageModuleMapsOfBuiltApps({
      platforms: [],
      fingerprints: FINGERPRINTS,
      buildRunConfig: {},
      commandParams: COMMAND_PARAMS,
    });

    expect(mocks.bundleFor).not.toHaveBeenCalled();
    expect(mocks.logWarning).not.toHaveBeenCalled();
  });
});
