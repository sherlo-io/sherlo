/**
 * The wait for the quick check: the status is asked until no platform runs one, a limit ends it,
 * and one line shows while it waits.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildStatus } from '../../../helpers/buildStatusRequest';
import { describeWhatRuns } from '../../../render/testSteps';
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

  it('asks again after a status read fails and returns the counts the next read gives', async () => {
    getBuildStatus
      .mockResolvedValueOnce(statusWith('RUNNING'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(statusWith('FINISHED'));

    const answer = await waitForQuickCheck({ openBuildReturn: openedWith('RUNNING'), ...ASK });

    expect(answer?.platforms?.android?.capture?.quickCheck).toBe('FINISHED');
    expect(getBuildStatus).toHaveBeenCalledTimes(3);
  });

  it('ends with the counts when one read fails while both platforms run and they finish 30 seconds later', async () => {
    const both = (quickCheck: 'RUNNING' | 'FINISHED'): BuildStatus => {
      const numbers =
        quickCheck === 'FINISHED'
          ? { storiesChecked: 73, storiesCaptured: 4, storiesReused: 69 }
          : {};
      const capture = { full: false, reason: null, storyFiles: [], quickCheck, ...numbers };
      return {
        runStatus: 'inProgress',
        platforms: {
          android: { arrived: true, capture },
          ios: { arrived: true, capture },
        },
      } as BuildStatus;
    };
    // One read every 3 seconds: two running, one slow read that fails, ten more running, finished.
    getBuildStatus
      .mockResolvedValueOnce(both('RUNNING'))
      .mockResolvedValueOnce(both('RUNNING'))
      .mockRejectedValueOnce(new Error('read timed out'));
    for (let ask = 0; ask < 10; ask++) getBuildStatus.mockResolvedValueOnce(both('RUNNING'));
    getBuildStatus.mockResolvedValue(both('FINISHED'));

    const answer = await waitForQuickCheck({ openBuildReturn: openedWith('RUNNING'), ...ASK });

    expect(answer?.platforms?.android?.capture?.storiesChecked).toBe(73);
    expect(answer?.platforms?.ios?.capture?.storiesCaptured).toBe(4);
    expect(answer?.platforms?.ios?.capture?.storiesReused).toBe(69);
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

  it('a partial answer with no story files and a module map counts no stories and no scenes', () => {
    const capture = [
      { platform: 'ios' as const, full: false, capturedStories: 0, capturedScenes: 2 },
    ];
    const manifest = {
      raw: Buffer.from('{}'),
      parsed: { version: 1, header: {}, moduleHashes: {}, storyClosures: {}, storyCounts: {} },
    } as any;
    const answer: BuildStatus = {
      runStatus: 'inProgress',
      platforms: {
        ios: {
          arrived: true,
          capture: { full: false, reason: null, storyFiles: [], ...NUMBERS },
        },
      },
    };

    const [ios] = captureWithTheAnswer(capture, answer, { ios: manifest });

    expect(ios.capturedStories).toBe(0);
    expect(ios.capturedScenes).toBe(0);
  });

  it('an answer that captures a story and two scenes counts one story and two scenes', () => {
    const capture = [
      {
        platform: 'ios' as const,
        full: false,
        capturedStories: 0,
        capturedScenes: 0,
        storiesInBundle: 1,
        scenesInBundle: 7,
      },
    ];
    const storyFiles = ['src/Home.stories.tsx', 'src/a.scenes.tsx', 'src/b.scenes.tsx'];
    const manifest = {
      raw: Buffer.from('{}'),
      parsed: {
        version: 1,
        header: {},
        moduleHashes: {},
        storyClosures: {},
        storyCounts: {
          'src/Home.stories.tsx': 1,
          'src/a.scenes.tsx': 1,
          'src/b.scenes.tsx': 1,
          'src/c.scenes.tsx': 5,
        },
        sceneIds: ['1', '2', '3', '4', '5', '6', '7'],
      },
    } as any;
    const answer: BuildStatus = {
      runStatus: 'inProgress',
      platforms: {
        ios: {
          arrived: true,
          capture: { full: false, reason: null, storyFiles, ...NUMBERS, storiesCaptured: 3 },
        },
      },
    };

    const answered = captureWithTheAnswer(capture, answer, { ios: manifest });

    expect(describeWhatRuns({ capture: answered })).toBe('1 of 1 story and 2 of 7 scenes');
  });

  it('keeps the open answer captured stories when a failed answer has null counts', () => {
    const capture = [{ platform: 'android' as const, full: false, capturedStories: 90 }];
    const answer = {
      runStatus: 'inProgress',
      platforms: {
        android: {
          arrived: true,
          capture: {
            full: false,
            reason: null,
            storyFiles: [],
            quickCheck: 'FAILED',
            storiesChecked: null,
            storiesCaptured: null,
            storiesReused: null,
          },
        },
      },
    } as BuildStatus;

    const [android] = captureWithTheAnswer(capture, answer);

    expect(android.capturedStories).toBe(90);
    expect(android.diffScope?.quickCheck).toBe('FAILED');
    expect(android.diffScope?.storiesCaptured).toBeUndefined();
  });
});
