// src/runnerWalk.ts: which boot a runner drives, and how the launch's story is walked for it.
const launch = vi.hoisted(() => ({ bundler: null as string | null, core: undefined as unknown }));
const clearMocks = vi.hoisted(() => vi.fn());

vi.mock('../bundlerOrigin', () => ({ bundlerOrigin: () => launch.bundler }));
vi.mock('../mocking', () => ({ clearMocks }));
vi.mock('../sealedCore/loadSealedCore', () => ({ getSealedCore: () => launch.core }));

const walk = vi.hoisted(() => ({ route: [] as string[], now: 0 }));
vi.mock('../reachedScreen', () => ({ reachedRoute: () => walk.route }));
vi.mock('../settleClock', () => ({ monotonicNow: () => walk.now }));

import { isDrivenByRunner, routeChangesSoFar, walkTheStoryForTheRunner } from '../runnerWalk';

const STORY = { insets: { top: 1, bottom: 2 }, collectMetadata: () => undefined };

beforeEach(() => {
  clearMocks.mockClear();
  launch.bundler = null;
  launch.core = undefined;
});

it('a boot whose bundle came from the device is driven by a runner', () => {
  expect(isDrivenByRunner()).toBe(true);
});

it('a boot whose bundle came from a bundler is not driven by a runner', () => {
  launch.bundler = 'http://localhost:8081';

  expect(isDrivenByRunner()).toBe(false);
});

it('the story goes to the core and the mocks are cleared after it', async () => {
  const testStory = vi.fn(async () => {});
  launch.core = { testStory };

  await walkTheStoryForTheRunner(STORY);

  expect(testStory).toHaveBeenCalledWith(STORY);
  expect(clearMocks).toHaveBeenCalledTimes(1);
});

it('the mocks are cleared when the core throws', async () => {
  launch.core = {
    testStory: async () => {
      throw new Error('the core failed');
    },
  };

  await expect(walkTheStoryForTheRunner(STORY)).rejects.toThrow('the core failed');
  expect(clearMocks).toHaveBeenCalledTimes(1);
});

it('every route change during a scene is recorded in order', async () => {
  vi.useFakeTimers();
  walk.route = ['Home'];
  walk.now = 10;
  launch.core = {
    testStory: async () => {
      walk.route = ['ChatStack', 'Chat'];
      walk.now = 250;
      await vi.advanceTimersByTimeAsync(150);
      await vi.advanceTimersByTimeAsync(150);
      walk.route = ['Modal'];
      walk.now = 700;
      await vi.advanceTimersByTimeAsync(150);
    },
  };

  await walkTheStoryForTheRunner(STORY);
  vi.useRealTimers();

  expect(routeChangesSoFar()).toEqual([
    { route: ['Home'], atMs: 10 },
    { route: ['ChatStack', 'Chat'], atMs: 250 },
    { route: ['Modal'], atMs: 700 },
  ]);
});

it('with no core the mocks are still cleared', async () => {
  await walkTheStoryForTheRunner(STORY);

  expect(clearMocks).toHaveBeenCalledTimes(1);
});
