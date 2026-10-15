/**
 * Tests for the sim road of `sherlo test` - which devices the run config names.
 *
 * Covers:
 *  - one job of a split CI run names every device of the test, as the staged and standard roads do,
 *    so the run waits for the other platform's job.
 *  - a test of its own names the devices it was given.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../helpers', () => ({
  getAppBuildUrl: vi.fn(() => 'http://app/build'),
  getBuildRunConfig: vi.fn(() => ({ ios: {} })),
  getGitInfo: vi.fn(),
  getPlatformsToTest: vi.fn(() => ['ios']),
  getValidatedCommandParams: vi.fn(() => ({
    devices: [],
    credential: { token: 'token-value', projectIndex: 3, teamId: 'team' },
  })),
  handleClientError: vi.fn((error) => {
    throw error;
  }),
  reporting: { flush: vi.fn(), addBreadcrumb: vi.fn(), setTag: vi.fn() },
  throwError: vi.fn(({ message }: { message: string }) => {
    throw new Error(message);
  }),
}));

vi.mock('../simWorld', () => ({
  readSimWorld: vi.fn(() => ({ dirPath: '/world', parsed: {} })),
}));
vi.mock('../deriveSimManifest', () => ({ default: vi.fn(() => ({ raw: '{}' })) }));
vi.mock('../composeSimWorldFile', () => ({ default: vi.fn(() => Buffer.from('{}')) }));
vi.mock('../uploadStagedArtifacts', () => ({ putBuffer: vi.fn() }));
vi.mock('../closeTheRun', () => ({ closeTheRun: vi.fn() }));
vi.mock('../stagedRun', () => ({ printTestStarted: vi.fn() }));
vi.mock('../appBuild/joinTheRun', () => ({
  joinTheRun: vi.fn(async () => ({ build: { index: 7 }, waitingFor: [] })),
}));
// A job with a `--platform` joins the run its `--run-id` names; any other job joins none.
vi.mock('../appBuild/buildThenPush', () => ({
  splitRunKeyOf: (options: { platform?: string; runId?: string }) =>
    options.platform ? `run:${options.runId}` : null,
}));
vi.mock('../../../seams/serverCalls', () => ({
  serverCalls: () => ({
    getStagedUploadUrls: vi.fn(async () => ({
      stagedPresignedUploadUrls: {
        ios: {
          manifest: { url: 'u1', s3Key: 'm' },
          jsBundle: { url: 'u2', s3Key: 'w' },
        },
      },
    })),
    openBuild: vi.fn(async () => ({ build: { index: 7 }, buildRun: { config: {} } })),
  }),
}));

import { getBuildRunConfig } from '../../../helpers';
import simRun from '../simRun';

const mockGetBuildRunConfig = vi.mocked(getBuildRunConfig);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('the devices a sim run names', () => {
  it('one job of a split run names every device of the test', async () => {
    await simRun({ platform: 'ios', runId: 'one-ci-run' } as any, '/world');

    expect(mockGetBuildRunConfig).toHaveBeenCalledWith(
      expect.objectContaining({ wholeTest: true })
    );
  });

  it('a test of its own names the devices it was given', async () => {
    await simRun({} as any, '/world');

    expect(mockGetBuildRunConfig.mock.calls[0][0]).not.toHaveProperty('wholeTest');
  });
});
