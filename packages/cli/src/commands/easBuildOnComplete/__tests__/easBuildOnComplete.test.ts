/**
 * Unit tests for the easBuildOnComplete hook entry.
 *
 * The hook is driven by EAS_BUILD_* env vars and the .sherlo temp-data read.
 * We stub the temp-data read, the upload orchestrator, and the sdk-client so
 * no real network / fs / upload runs. We assert:
 *  - happy path: forwards buildIndex/profile/token to asyncUploadBuildAndRunTests
 *  - loud failure: EAS_BUILD_STATUS === 'errored' -> client.closeBuild + throw
 *  - early-return guards (built locally / profile mismatch / no temp data)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const closeBuild = vi.fn().mockResolvedValue(undefined);
  return {
    closeBuild,
    sdkClient: vi.fn().mockReturnValue({ closeBuild }),
    asyncUploadBuildAndRunTests: vi.fn().mockResolvedValue(undefined),
    getSherloTempData: vi.fn(),
    getTokenParts: vi
      .fn()
      .mockReturnValue({ apiToken: 'api-tok', projectIndex: 7, teamId: 'team1234' }),
    handleClientError: vi.fn(),
    logInfo: vi.fn(),
    printSherloIntro: vi.fn(),
    throwError: vi.fn((params: any) => {
      throw new Error(params?.message ?? params?.error?.message ?? 'throwError');
    }),
  };
});

vi.mock('@sherlo/sdk-client', () => ({ default: mocks.sdkClient }));

vi.mock('../helpers', () => ({
  asyncUploadBuildAndRunTests: mocks.asyncUploadBuildAndRunTests,
  getSherloTempData: mocks.getSherloTempData,
}));

vi.mock('../../../helpers', () => ({
  getTokenParts: mocks.getTokenParts,
  handleClientError: mocks.handleClientError,
  logInfo: mocks.logInfo,
  printSherloIntro: mocks.printSherloIntro,
  throwError: mocks.throwError,
}));

import easBuildOnComplete from '../easBuildOnComplete';

// ---------------------------------------------------------------------------
// Env save / restore
// ---------------------------------------------------------------------------

const ENV_KEYS = ['EAS_BUILD_RUNNER', 'EAS_BUILD_PROFILE', 'EAS_BUILD_STATUS'] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  vi.spyOn(console, 'log').mockImplementation(() => {});

  // Default: a cloud EAS build for the "preview" profile that succeeded.
  process.env.EAS_BUILD_RUNNER = 'eas-build';
  process.env.EAS_BUILD_PROFILE = 'preview';
  delete process.env.EAS_BUILD_STATUS;
  mocks.getSherloTempData.mockReturnValue({ buildIndex: 5, token: 'the-token' });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('easBuildOnComplete - happy path', () => {
  it('forwards buildIndex, profile and token to asyncUploadBuildAndRunTests', async () => {
    await easBuildOnComplete({ profile: 'preview' } as any);

    expect(mocks.asyncUploadBuildAndRunTests).toHaveBeenCalledTimes(1);
    expect(mocks.asyncUploadBuildAndRunTests).toHaveBeenCalledWith({
      buildIndex: 5,
      easBuildProfile: 'preview',
      token: 'the-token',
    });
    expect(mocks.closeBuild).not.toHaveBeenCalled();
  });

  it('matches when the current EAS profile is one of a comma-separated list', async () => {
    process.env.EAS_BUILD_PROFILE = 'preview';

    await easBuildOnComplete({ profile: 'production,preview' } as any);

    expect(mocks.asyncUploadBuildAndRunTests).toHaveBeenCalledWith({
      buildIndex: 5,
      easBuildProfile: 'preview',
      token: 'the-token',
    });
  });
});

// ---------------------------------------------------------------------------
// Loud failure - EAS build errored on Expo servers
// ---------------------------------------------------------------------------

describe('easBuildOnComplete - EAS build errored', () => {
  beforeEach(() => {
    process.env.EAS_BUILD_STATUS = 'errored';
  });

  it('closes the build as errored and throws, without uploading', async () => {
    await expect(easBuildOnComplete({ profile: 'preview' } as any)).rejects.toThrow(
      "Sherlo test can't be executed"
    );

    expect(mocks.closeBuild).toHaveBeenCalledWith({
      buildIndex: 5,
      projectIndex: 7,
      teamId: 'team1234',
      runError: 'user_easCloudBuild',
    });
    expect(mocks.asyncUploadBuildAndRunTests).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Early-return guards
// ---------------------------------------------------------------------------

describe('easBuildOnComplete - early returns', () => {
  it('does nothing when the build ran locally (EAS_BUILD_RUNNER !== eas-build)', async () => {
    process.env.EAS_BUILD_RUNNER = 'local';

    await easBuildOnComplete({ profile: 'preview' } as any);

    expect(mocks.asyncUploadBuildAndRunTests).not.toHaveBeenCalled();
    expect(mocks.getSherloTempData).not.toHaveBeenCalled();
  });

  it('skips when the current EAS profile does not match the requested profile', async () => {
    process.env.EAS_BUILD_PROFILE = 'production';

    await easBuildOnComplete({ profile: 'preview' } as any);

    expect(mocks.asyncUploadBuildAndRunTests).not.toHaveBeenCalled();
  });

  it('returns early when no sherlo temp data is present', async () => {
    mocks.getSherloTempData.mockReturnValue(undefined);

    await easBuildOnComplete({ profile: 'preview' } as any);

    expect(mocks.asyncUploadBuildAndRunTests).not.toHaveBeenCalled();
    expect(mocks.closeBuild).not.toHaveBeenCalled();
  });
});
