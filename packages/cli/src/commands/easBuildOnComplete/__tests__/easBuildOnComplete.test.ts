/**
 * Unit tests for the easBuildOnComplete hook entry.
 *
 * The hook is driven by EAS_BUILD_* env vars and the .sherlo temp-data read.
 * We stub the temp-data read, the upload orchestrator, and the sdk-client so
 * no real network / fs / upload runs. We assert:
 *  - happy path: forwards buildIndex/profile/ticket to asyncUploadBuildAndRunTests
 *  - loud failure: EAS_BUILD_STATUS === 'errored' -> client.closeBuild + throw
 *  - early-return guards (built locally / profile mismatch / no temp data)
 *  - which Sherlo it calls, and which profile it answers for
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const closeBuild = vi.fn().mockResolvedValue(undefined);
  return {
    closeBuild,
    sdkClient: vi.fn().mockReturnValue({ closeBuild }),
    asyncUploadBuildAndRunTests: vi.fn().mockResolvedValue(undefined),
    getSherloTempData: vi.fn(),
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
  handleClientError: mocks.handleClientError,
  logInfo: mocks.logInfo,
  printSherloIntro: mocks.printSherloIntro,
  throwError: mocks.throwError,
}));

import easBuildOnComplete from '../easBuildOnComplete';

// ---------------------------------------------------------------------------
// Env save / restore
// ---------------------------------------------------------------------------

// `npm_lifecycle_event` too: the package manager running this suite sets it to its own script.
const ENV_KEYS = [
  'EAS_BUILD_RUNNER',
  'EAS_BUILD_PROFILE',
  'EAS_BUILD_STATUS',
  'EAS_BUILD_PLATFORM',
  'npm_lifecycle_event',
  'SHERLO_API_URL',
] as const;

/** The hand-over file `sherlo test` wrote: the run, its ticket, its team and project. */
const HAND_OVER = { buildIndex: 5, ticket: 'sbt_the-ticket', teamId: 'team1234', projectIndex: 7 };

/** What the hook hands the upload for that file, on a build of `preview`. */
const UPLOAD_ARGS = {
  buildIndex: 5,
  easBuildProfile: 'preview',
  ticket: 'sbt_the-ticket',
  teamId: 'team1234',
  projectIndex: 7,
};
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  vi.spyOn(console, 'log').mockImplementation(() => {});

  // Default: a cloud EAS build for the "preview" profile that succeeded.
  process.env.EAS_BUILD_RUNNER = 'eas-build';
  process.env.EAS_BUILD_PROFILE = 'preview';
  delete process.env.EAS_BUILD_STATUS;
  process.env.npm_lifecycle_event = 'eas-build-on-complete';
  delete process.env.SHERLO_API_URL;
  mocks.getSherloTempData.mockReturnValue(HAND_OVER);
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
  it('forwards buildIndex, profile and the run ticket to asyncUploadBuildAndRunTests', async () => {
    await easBuildOnComplete({ profile: 'preview' } as any);

    expect(mocks.asyncUploadBuildAndRunTests).toHaveBeenCalledTimes(1);
    expect(mocks.asyncUploadBuildAndRunTests).toHaveBeenCalledWith(UPLOAD_ARGS);
    expect(mocks.closeBuild).not.toHaveBeenCalled();
  });

  it('matches when the current EAS profile is one of a comma-separated list', async () => {
    process.env.EAS_BUILD_PROFILE = 'preview';

    await easBuildOnComplete({ profile: 'production,preview' } as any);

    expect(mocks.asyncUploadBuildAndRunTests).toHaveBeenCalledWith(UPLOAD_ARGS);
  });

  it('takes the profile from .sherlo/data.json when --profile is not passed', async () => {
    mocks.getSherloTempData.mockReturnValue({ ...HAND_OVER, profile: 'preview' });

    await easBuildOnComplete({} as any);

    expect(mocks.asyncUploadBuildAndRunTests).toHaveBeenCalledWith(UPLOAD_ARGS);
  });

  it('refuses in its own words when neither the hand-over file nor --profile names a profile', async () => {
    await expect(easBuildOnComplete({} as any)).rejects.toThrow(
      "Can't upload the EAS build: no EAS profile is named. .sherlo/data.json names none, and --profile was not passed."
    );

    expect(mocks.asyncUploadBuildAndRunTests).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Which Sherlo the hook calls - Expo's machine knows no address of its own
// ---------------------------------------------------------------------------

describe('easBuildOnComplete - the Sherlo address', () => {
  it("calls the Sherlo address the hand-over file names, before SHERLO_API_URL and the tool's own", async () => {
    process.env.SHERLO_API_URL = 'https://api.from-the-environment.example';
    process.env.EAS_BUILD_STATUS = 'errored';
    mocks.getSherloTempData.mockReturnValue({
      ...HAND_OVER,
      apiUrl: 'https://api.the-run-was-opened-on.example',
    });

    await expect(easBuildOnComplete({ profile: 'preview' } as any)).rejects.toThrow();

    // The run is closed on the service that opened it, with the run's own ticket.
    expect(mocks.sdkClient).toHaveBeenCalledWith(
      { authToken: 'sbt_the-ticket' },
      'https://api.the-run-was-opened-on.example'
    );
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
      "The EAS build failed on Expo's servers, so Test 5 can't run."
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

describe('easBuildOnComplete - the platform of a failed build', () => {
  it('a failed or cancelled EAS build closes its test naming its own platform', async () => {
    process.env.EAS_BUILD_PLATFORM = 'android';
    process.env.EAS_BUILD_STATUS = 'errored';
    await expect(easBuildOnComplete({ profile: 'preview' } as any)).rejects.toThrow();

    delete process.env.EAS_BUILD_STATUS;
    process.env.EAS_BUILD_PLATFORM = 'ios';
    process.env.npm_lifecycle_event = 'eas-build-on-cancel';
    await expect(easBuildOnComplete({ profile: 'preview' } as any)).rejects.toThrow();

    expect(mocks.closeBuild).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ runError: 'user_easCloudBuild', runErrorPlatform: 'android' })
    );
    expect(mocks.closeBuild).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ runError: 'user_easCloudBuild', runErrorPlatform: 'ios' })
    );
  });
});

// ---------------------------------------------------------------------------
// A cancelled EAS build - Expo runs the eas-build-on-cancel script, which runs this same command
// ---------------------------------------------------------------------------

describe('easBuildOnComplete - EAS build cancelled', () => {
  it('run from the eas-build-on-cancel script, closes the run as errored without uploading', async () => {
    process.env.npm_lifecycle_event = 'eas-build-on-cancel';

    await expect(easBuildOnComplete({ profile: 'preview' } as any)).rejects.toThrow(
      "The EAS build was canceled, so Test 5 can't run."
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
