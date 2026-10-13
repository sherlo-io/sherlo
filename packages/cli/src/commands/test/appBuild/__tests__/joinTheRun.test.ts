import { DEVICES } from '@sherlo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEmit, mockJoinBuild } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
  mockJoinBuild: vi.fn(),
}));

vi.mock('../../../../helpers/transcriptSink', () => ({ emit: mockEmit }));
vi.mock('../../../../seams/serverCalls', () => ({
  serverCalls: () => ({ joinBuild: mockJoinBuild }),
}));
vi.mock('../../../../helpers', async () => ({
  getPlatformsToTest: (await import('../../../../helpers/getPlatformsToTest')).default,
  handleClientError: vi.fn((error) => {
    throw error;
  }),
  throwError: vi.fn(({ message }: { message: string }) => {
    throw new Error(message);
  }),
}));
vi.mock('../../platformRows', () => ({
  rowsAbove: (rows: unknown[]) => ({ rows, printedAsTheyHappened: false }),
  printPlatformRowInALog: (row: unknown) => row,
}));

import { JOIN_MISMATCH_ERROR, joinTheRun } from '../joinTheRun';

const deviceIdOn = (os: string) =>
  Object.keys(DEVICES).find((id) => (DEVICES as Record<string, { os: string }>)[id].os === os);
const ANDROID_DEVICE = { id: deviceIdOn('android') } as any;
const IOS_DEVICE = { id: deviceIdOn('ios') } as any;

function join(overrides: Record<string, unknown> = {}) {
  return joinTheRun({
    token: 'token',
    joinKey: 'github:acme/app/123',
    platform: 'android',
    request: {} as any,
    platformRows: [{ platform: 'android', appBuild: 'built' }] as any,
    ...overrides,
  });
}

beforeEach(() => vi.clearAllMocks());

describe('a job joins the run its CI run shares', () => {
  it('a job that is not the last says which platform the run waits for', async () => {
    mockJoinBuild.mockResolvedValue({ build: { index: 7 }, waitingFor: ['ios'] });

    const joined = await join();

    expect(joined.waitingFor).toEqual(['ios']);
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'run-waits-for-builds',
        buildIndex: 7,
        waitingFor: { otherJob: 'ios' },
      })
    );
  });

  it('the last job to join prints the ordinary started row, with the other platform arrived from the other job', async () => {
    mockJoinBuild.mockResolvedValue({ build: { index: 7 }, waitingFor: [] });

    await join({ testDevices: [ANDROID_DEVICE, IOS_DEVICE] });

    expect(mockEmit).toHaveBeenCalledTimes(1);
    const started = mockEmit.mock.calls[0][0];
    expect(started.kind).toBe('test-started');
    expect(started.buildIndex).toBe(7);
    expect(started.rowsAbove.rows).toEqual([
      { platform: 'android', appBuild: 'built' },
      { platform: 'ios', appBuild: 'arrived-from-other-job' },
    ]);
  });

  it('a join refused for another commit says both jobs of one CI run must build the same commit', async () => {
    mockJoinBuild.mockRejectedValue(new Error(JOIN_MISMATCH_ERROR));

    await expect(join()).rejects.toThrow('Both jobs of one CI run must build the same commit');
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
