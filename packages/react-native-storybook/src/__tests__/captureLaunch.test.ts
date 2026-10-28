// src/captureLaunch.ts: the one decision that a launch is a capture of a scene of an app with its
// own Storybook.
const launch = vi.hoisted(() => ({
  mode: 'testing',
  storyId: 'chat--conversation' as string | undefined,
  discover: undefined as boolean | undefined,
  bundler: 'http://localhost:8081' as string | null,
  facts: true,
  storyIds: [] as string[],
}));

vi.mock('../SherloModule', () => ({
  default: {
    getMode: () => launch.mode,
    getLastState: () => ({
      nextSnapshot: { storyId: launch.storyId },
      discover: launch.discover,
    }),
  },
}));
vi.mock('../bundlerOrigin', () => ({ bundlerOrigin: () => launch.bundler }));
vi.mock('../getStorybook/storybookFacts', () => ({
  readStorybookFacts: () =>
    launch.facts
      ? { storyIndex: Object.fromEntries(launch.storyIds.map((id) => [id, { id }])) }
      : null,
}));
vi.mock('../bundledScenes', () => ({
  default: {
    'chat--conversation': { filePath: './a.scenes.tsx', sceneName: 'A', loadFile: () => {} },
  },
}));

import {
  discoverOfTheTestingLaunch,
  idOfTheTestingLaunch,
  sceneOfTheCaptureOfAnAppWithStorybook,
} from '../captureLaunch';

beforeEach(() => {
  launch.mode = 'testing';
  launch.storyId = 'chat--conversation';
  launch.discover = undefined;
  launch.bundler = 'http://localhost:8081';
  launch.facts = true;
  launch.storyIds = [];
});

it('a capture launch of a story whose id is also a scene id is not taken for a scene', () => {
  launch.storyIds = ['chat--conversation'];

  expect(sceneOfTheCaptureOfAnAppWithStorybook()).toBeUndefined();
});

it('a testing launch that names a scene of the bundle, with Storybook and a bundler, is a capture of that scene', () => {
  expect(sceneOfTheCaptureOfAnAppWithStorybook()).toBe('chat--conversation');
});

it('a launch that names a story the bundle holds no scene for is not a capture', () => {
  launch.storyId = 'button--primary';

  expect(sceneOfTheCaptureOfAnAppWithStorybook()).toBeUndefined();
});

it('a launch with no Storybook facts, a runner driving it, no story id or another mode is not a capture', () => {
  launch.facts = false;
  expect(sceneOfTheCaptureOfAnAppWithStorybook()).toBeUndefined();
  launch.facts = true;
  launch.bundler = null;
  expect(sceneOfTheCaptureOfAnAppWithStorybook()).toBeUndefined();
  launch.bundler = 'http://localhost:8081';
  launch.storyId = undefined;
  expect(sceneOfTheCaptureOfAnAppWithStorybook()).toBeUndefined();
  launch.storyId = 'chat--conversation';
  launch.mode = 'default';
  expect(sceneOfTheCaptureOfAnAppWithStorybook()).toBeUndefined();
});

it('a runner-driven launch reads the scene id the runner carries for a scene', () => {
  launch.bundler = null;
  launch.storyId = 'inbox--full';

  expect(idOfTheTestingLaunch()).toBe('inbox--full');
  launch.storyId = '';
  expect(idOfTheTestingLaunch()).toBeUndefined();
});

it('a launch carrying the discover flag turns discover mode on', () => {
  expect(discoverOfTheTestingLaunch()).toBe(false);

  launch.discover = true;
  expect(discoverOfTheTestingLaunch()).toBe(true);

  launch.mode = 'default';
  expect(discoverOfTheTestingLaunch()).toBe(false);
});
