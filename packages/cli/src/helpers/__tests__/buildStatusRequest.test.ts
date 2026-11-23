/**
 * `sherlo view --json` AS A RECORD OF THE TEST - what the status request and the list of stories
 * make of one finished test: the JSON of a viewed test, with every story under its platform.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { viewJsonOf } from '../../commands/view/printBuildView';
import { installServerCalls, type ServerCalls } from '../../seams/serverCalls';
import { readStoriesDiffScope } from '../readStoriesDiffScope';
import {
  CAPTURED_STORY,
  FINISHED_TEST_ON_IOS,
  REUSED_STORY,
  TEST_UNDER_READ,
  WHOLE_PAGE,
} from './support/storiesDiffScopeFixture';

let uninstall: (() => void) | undefined;

afterEach(() => uninstall?.());

describe('the JSON of a viewed test', () => {
  it('the JSON of a viewed test lists every story with its Diff Scope record', async () => {
    const getStoriesDiffScope = vi.fn().mockResolvedValue(WHOLE_PAGE);
    uninstall = installServerCalls({ getStoriesDiffScope } as unknown as ServerCalls);

    const lists = await readStoriesDiffScope(TEST_UNDER_READ, FINISHED_TEST_ON_IOS);
    const json = viewJsonOf(FINISHED_TEST_ON_IOS, 7, lists);

    expect(json.platforms?.ios?.diffScopeStories).toEqual([CAPTURED_STORY, REUSED_STORY]);
    expect(json.platforms?.ios?.arrived).toBe(true);
    expect(json.platforms?.android).toBeUndefined();
    expect(getStoriesDiffScope).toHaveBeenCalledTimes(1);
    expect(getStoriesDiffScope).toHaveBeenCalledWith({ ...TEST_UNDER_READ, platform: 'ios' });
  });

  it('the JSON of a test with no list read keeps the record it had before', () => {
    const json = viewJsonOf(FINISHED_TEST_ON_IOS, 7);

    expect(json.platforms).toEqual({ ios: { arrived: true } });
  });
});
