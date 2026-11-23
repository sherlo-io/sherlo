import { afterEach, describe, expect, it, vi } from 'vitest';
import { installServerCalls, type ServerCalls } from '../../seams/serverCalls';
import {
  isAnyListIncomplete,
  readStoriesDiffScope,
  STORIES_NOT_AVAILABLE_WORDS,
} from '../readStoriesDiffScope';
import {
  CAPTURED_STORY,
  FINISHED_TEST_ON_IOS,
  REUSED_STORY,
  TEST_UNDER_READ,
  WHOLE_PAGE,
} from './support/storiesDiffScopeFixture';

let uninstall: (() => void) | undefined;

afterEach(() => uninstall?.());

function serverAnswering(getStoriesDiffScope: ReturnType<typeof vi.fn>): void {
  uninstall = installServerCalls({ getStoriesDiffScope } as unknown as ServerCalls);
}

describe('the read of every story of a test (readStoriesDiffScope)', () => {
  it('reads every page of a cut list and joins them in order', async () => {
    const getStoriesDiffScope = vi
      .fn()
      .mockResolvedValueOnce({ isCut: true, nextAfter: 'ios#2', stories: [CAPTURED_STORY] })
      .mockResolvedValueOnce({ isCut: false, stories: [REUSED_STORY] });
    serverAnswering(getStoriesDiffScope);

    const lists = await readStoriesDiffScope(TEST_UNDER_READ, FINISHED_TEST_ON_IOS);

    expect(lists.ios?.diffScopeStories).toEqual([CAPTURED_STORY, REUSED_STORY]);
    expect(isAnyListIncomplete(lists)).toBe(false);
    expect(getStoriesDiffScope).toHaveBeenLastCalledWith(
      expect.objectContaining({ platform: 'ios', after: 'ios#2' })
    );
  });

  it('says the list is not available, with no list, when the team has no viewer', async () => {
    serverAnswering(vi.fn().mockResolvedValue(null));

    const lists = await readStoriesDiffScope(TEST_UNDER_READ, FINISHED_TEST_ON_IOS);

    expect(lists.ios).toEqual({ diffScopeStoriesNotAvailable: STORIES_NOT_AVAILABLE_WORDS });
    expect(isAnyListIncomplete(lists)).toBe(false);
  });

  it('says the list is incomplete when a later page fails, and keeps what was read', async () => {
    serverAnswering(
      vi
        .fn()
        .mockResolvedValueOnce({ isCut: true, nextAfter: 'ios#2', stories: [CAPTURED_STORY] })
        .mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'))
    );

    const lists = await readStoriesDiffScope(TEST_UNDER_READ, FINISHED_TEST_ON_IOS);

    expect(lists.ios?.diffScopeStoriesIncomplete).toBe('HTTP 500: Internal Server Error');
    expect(lists.ios?.diffScopeStories).toEqual([CAPTURED_STORY]);
    expect(isAnyListIncomplete(lists)).toBe(true);
  });

  it('says the list is incomplete when the service cuts it and names no next page', async () => {
    serverAnswering(vi.fn().mockResolvedValue({ ...WHOLE_PAGE, isCut: true }));

    const lists = await readStoriesDiffScope(TEST_UNDER_READ, FINISHED_TEST_ON_IOS);

    expect(isAnyListIncomplete(lists)).toBe(true);
  });

  it('asks nothing for a platform the test did not run on', async () => {
    const getStoriesDiffScope = vi.fn();
    serverAnswering(getStoriesDiffScope);

    const lists = await readStoriesDiffScope(TEST_UNDER_READ, { runStatus: 'finished' });

    expect(lists).toEqual({});
    expect(getStoriesDiffScope).not.toHaveBeenCalled();
  });
});
