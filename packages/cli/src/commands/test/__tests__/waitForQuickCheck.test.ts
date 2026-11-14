/**
 * The wait for the quick check: the status is asked until no platform runs one, a limit ends it,
 * and one line shows while it waits.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildStatus } from '../../../helpers/buildStatusRequest';
import type { OpenBuildAnswer } from '../../../seams/serverCalls';
import {
  captureWithTheAnswer,
  nothingToCaptureWords,
  QUICK_CHECK_WAIT_LIMIT_SECONDS,
  QUICK_CHECK_WAITING_WORDS,
  waitForQuickCheck,
} from '../waitForQuickCheck';

const { getBuildStatus, sleep, whileShowing } = vi.hoisted(() => ({
  getBuildStatus: vi.fn(),
  sleep: vi.fn(async (_ms: number) => {}),
  whileShowing: vi.fn(async (_step: unknown, work: () => Promise<unknown>) => work()),
}));

vi.mock('../../../seams/serverCalls', () => ({ serverCalls: () => ({ getBuildStatus }) }));
vi.mock('../../../seams/surroundings', () => ({ surroundings: () => ({ sleep }) }));
vi.mock('../../shared/terminal', () => ({ whileShowing }));

const ASK = { token: 'token', projectIndex: 3, teamId: 'team' };

function openedWith(quickCheck?: 'NOT_NEEDED' | 'RUNNING' | 'FINISHED'): OpenBuildAnswer {
  return {
    build: {
      index: 15,
      diffScopeInfo: { platforms: quickCheck ? { android: { quickCheck } } : {} },
    },
  } as unknown as OpenBuildAnswer;
}

function statusWith(quickCheck: 'RUNNING' | 'FINISHED'): BuildStatus {
  return {
    runStatus: 'inProgress',
    platforms: {
      android: {
        arrived: true,
        capture: { full: false, reason: null, storyFiles: [], quickCheck },
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the command waits for the quick check', () => {
  it("asks for the test's status until no platform is running its quick check", async () => {
    getBuildStatus
      .mockResolvedValueOnce(statusWith('RUNNING'))
      .mockResolvedValueOnce(statusWith('RUNNING'))
      .mockResolvedValueOnce(statusWith('FINISHED'));

    const answer = await waitForQuickCheck({ openBuildReturn: openedWith('RUNNING'), ...ASK });

    expect(getBuildStatus).toHaveBeenCalledTimes(3);
    expect(getBuildStatus).toHaveBeenCalledWith(expect.objectContaining({ buildIndex: 15 }));
    expect(answer?.platforms?.android?.capture?.quickCheck).toBe('FINISHED');
  });

  it('stops asking after the wait limit and returns the last answer', async () => {
    const running = statusWith('RUNNING');
    getBuildStatus.mockResolvedValue(running);

    const answer = await waitForQuickCheck({ openBuildReturn: openedWith('RUNNING'), ...ASK });

    const secondsSlept = sleep.mock.calls.reduce((total, [ms]) => total + ms / 1000, 0);
    expect(secondsSlept).toBeLessThanOrEqual(QUICK_CHECK_WAIT_LIMIT_SECONDS);
    expect(getBuildStatus.mock.calls.length).toBeGreaterThan(1);
    expect(answer).toBe(running);
  });

  it('shows one waiting line while it waits and none when no quick check runs', async () => {
    getBuildStatus.mockResolvedValueOnce(statusWith('FINISHED'));
    await waitForQuickCheck({ openBuildReturn: openedWith('RUNNING'), ...ASK });
    expect(whileShowing).toHaveBeenCalledTimes(1);
    expect(whileShowing.mock.calls[0][0]).toEqual({
      kind: 'quick-check-waiting',
      words: QUICK_CHECK_WAITING_WORDS,
    });

    whileShowing.mockClear();
    await waitForQuickCheck({ openBuildReturn: openedWith('FINISHED'), ...ASK });
    await waitForQuickCheck({ openBuildReturn: openedWith(), ...ASK });
    expect(whileShowing).not.toHaveBeenCalled();
  });

  it('never waits when the quick check is not needed', async () => {
    const answer = await waitForQuickCheck({ openBuildReturn: openedWith('NOT_NEEDED'), ...ASK });

    expect(answer).toBeUndefined();
    expect(getBuildStatus).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('ends the wait with the last answer when a status read fails', async () => {
    getBuildStatus
      .mockResolvedValueOnce(statusWith('RUNNING'))
      .mockRejectedValueOnce(new Error('network down'));

    const answer = await waitForQuickCheck({ openBuildReturn: openedWith('RUNNING'), ...ASK });

    expect(answer?.platforms?.android?.capture?.quickCheck).toBe('RUNNING');
    expect(getBuildStatus).toHaveBeenCalledTimes(2);
  });
});

const NUMBERS = {
  storiesChecked: 384,
  storiesLookDifferent: 0,
  storiesCouldNotBeChecked: 0,
  storiesCaptured: 0,
  storiesReused: 384,
};

describe('the words the finished answer gives the test', () => {
  it('names the three lines of a test with nothing to capture from the answer', () => {
    const answer: BuildStatus = {
      runStatus: 'finished',
      platforms: {
        android: {
          arrived: true,
          capture: {
            full: false,
            reason: 'src/utils/analytics.ts changed',
            storyFiles: [],
            ...NUMBERS,
          },
        },
      },
    };

    expect(nothingToCaptureWords(answer)).toBe(
      [
        'nothing to capture',
        '384 checked, after src/utils/analytics.ts changed',
        '0 captured: 0 look different, 0 could not be checked',
        '384 reuse their last picture, no devices started',
      ].join('\n')
    );
    expect(nothingToCaptureWords({ runStatus: 'finished' })).toBeUndefined();
  });

  it('puts the finished numbers over the open answer and leaves a platform without them', () => {
    const capture = [
      { platform: 'android' as const, full: false, capturedStories: 90 },
      { platform: 'ios' as const, full: false, capturedStories: 5 },
    ];
    const answer: BuildStatus = {
      runStatus: 'inProgress',
      platforms: {
        android: {
          arrived: true,
          capture: {
            full: false,
            reason: null,
            storyFiles: [],
            ...NUMBERS,
            storiesCaptured: 77,
            storiesReused: 307,
          },
        },
      },
    };

    const [android, ios] = captureWithTheAnswer(capture, answer);

    expect(android.capturedStories).toBe(77);
    expect(android.diffScope?.storiesChecked).toBe(384);
    expect(ios).toBe(capture[1]);
  });
});
