/**
 * THE STORY LIST - `storyList.ts` turns what the bundler's line answers to a list question into the
 * ids a capture prints, or into the ending a capture would have had.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listLiveStories } from '../storyList';

const line = vi.hoisted(() => ({ answer: undefined as unknown, asked: undefined as unknown }));

vi.mock('../bundlerLine', () => ({
  askTheBundlerLine: async (params: { question: unknown }) => {
    line.asked = params.question;
    return line.answer;
  },
}));

vi.mock('../appBundlerPort', () => ({
  withPortTheAppAsks: async <Ending>(ending: Ending) => ending,
}));

beforeEach(() => {
  line.answer = undefined;
  line.asked = undefined;
});

describe('listing the stories of the running app', () => {
  it('asks the list question and returns the ids the app said', async () => {
    line.answer = { kind: 'said', reply: { kind: 'listed', stories: ['a--one', 'b--two'] } };
    await expect(listLiveStories(8081)).resolves.toEqual({
      kind: 'listed',
      ids: ['a--one', 'b--two'],
    });
    expect(line.asked).toEqual({ action: 'listStories' });
  });

  it('ends as a capture does when no bundler answers', async () => {
    line.answer = { kind: 'nothing-on-the-port' };
    await expect(listLiveStories(8081)).resolves.toEqual({ kind: 'no-bundler' });
  });

  it('ends as a capture does when the line has no app, or speaks other words', async () => {
    line.answer = { kind: 'said', reply: { kind: 'no-app' } };
    await expect(listLiveStories(8081)).resolves.toEqual({ kind: 'no-app' });
    line.answer = { kind: 'not-in-sherlos-words', detail: 'status 404' };
    await expect(listLiveStories(8081)).resolves.toEqual({ kind: 'no-app' });
  });
});
