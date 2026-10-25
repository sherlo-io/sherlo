/**
 * The scene calls of the host (src/sealedCore/sceneCalls.ts): the SDK's play steps and ready wait,
 * which answer in their own words, as the seam's outcomes the sealed core reads. The functions
 * behind them are tested where they live (playSteps.test.ts, storyReady.test.ts); here they are
 * stood in for.
 */
const behind = vi.hoisted(() => ({
  scene: { play: [] as unknown[], ready: undefined as unknown },
  playSteps: vi.fn(),
  awaitReady: vi.fn(),
}));

vi.mock('../playSteps', async () => ({
  ...(await vi.importActual<typeof import('../playSteps')>('../playSteps')),
  playSteps: behind.playSteps,
}));

vi.mock('../storyReady', async () => ({
  ...(await vi.importActual<typeof import('../storyReady')>('../storyReady')),
  sceneOf: () => behind.scene,
  awaitReady: behind.awaitReady,
}));

vi.mock('../bundledScenes', () => ({
  default: {
    'chat--conversation': { filePath: './src/chat.scenes.tsx', sceneName: 'Conversation' },
  },
}));

import { isBundlerAssetUrl } from '../bundlerOrigin';
import { rulesInstalledProof } from '../mocking/registry';
import { causeOfCrash, readStoryError, threwOf } from '../getStorybook/storyErrorRegistry';
import { SherloStepError } from '../playSteps';
import { sceneCallsForTheCore } from '../sealedCore/sceneCalls';

const SCENE_ID = 'chat--conversation';
const calls = sceneCallsForTheCore();

beforeEach(() => {
  behind.scene.play = [{ tap: 'Connections' }, { ready: 'list' }, { open: 'app://chat/1' }];
  behind.scene.ready = { testID: ['chat', 'composer'], gone: ['spinner'] };
  behind.playSteps.mockReset();
  behind.awaitReady.mockReset();
});

describe('the scene calls of the host', () => {
  it('lists every scene of the bundle with its id and its file', () => {
    expect(calls.scenes()).toEqual([{ id: SCENE_ID, file: './src/chat.scenes.tsx' }]);
  });

  it('a scene whose steps all played answers the views and links it played, not its ready steps', async () => {
    behind.playSteps.mockResolvedValue([]);

    await expect(calls.playSteps!(SCENE_ID)).resolves.toEqual({
      played: [{ tap: 'Connections' }, { open: 'app://chat/1' }],
    });
  });

  it('a tap whose view never showed answers the missing step, the steps before it and its limit', async () => {
    behind.scene.play = [{ open: 'app://home' }, { tap: { text: 'Row' } }];
    behind.playSteps.mockRejectedValue(
      new SherloStepError(SCENE_ID, 'step 2 of 2', 'no visible view', ['open app://home'], true)
    );

    await expect(calls.playSteps!(SCENE_ID)).resolves.toEqual({
      played: [{ open: 'app://home' }],
      missing: { tap: 'text "Row"' },
      limitMs: 10_000,
    });
  });

  it('a scene whose first tap is missing and whose ready view never shows ends as never-reached on SignIn', async () => {
    behind.scene.play = [{ tap: { testID: 'Inbox' } }];
    behind.scene.ready = { testID: 'inbox' };
    behind.awaitReady.mockResolvedValue({ outcome: 'timed-out', route: ['SignIn'], line: 'x' });
    behind.playSteps.mockRejectedValue(
      new SherloStepError(SCENE_ID, 'step 1 of 1', 'no visible view', [], true)
    );

    await expect(calls.playSteps!(SCENE_ID)).resolves.toEqual({ played: [] });
    expect(readStoryError(SCENE_ID)).toBeUndefined();
    await expect(calls.awaitReady!(SCENE_ID)).resolves.toEqual({
      outcome: 'timed-out',
      ready: 'inbox',
      stayedOn: ['SignIn'],
    });
    expect(behind.awaitReady).toHaveBeenCalledTimes(1);
  });

  it('a scene whose first tap is missing ends as play-target-missing when its ready view shows later', async () => {
    behind.scene.play = [{ tap: { testID: 'Inbox' } }];
    behind.scene.ready = { testID: 'inbox' };
    behind.awaitReady.mockResolvedValue({ outcome: 'shown' });
    behind.playSteps.mockRejectedValue(
      new SherloStepError(SCENE_ID, 'step 1 of 1', 'no visible view', [], true)
    );

    await expect(calls.playSteps!(SCENE_ID)).resolves.toEqual({
      played: [],
      missing: { tap: 'Inbox' },
      limitMs: 10_000,
    });
  });

  it('a scene with no ready view whose first tap is missing stays play-target-missing', async () => {
    behind.scene.play = [{ tap: { testID: 'Inbox' } }];
    behind.scene.ready = undefined;
    behind.awaitReady.mockResolvedValue({ outcome: 'shown' });
    behind.playSteps.mockRejectedValue(
      new SherloStepError(SCENE_ID, 'step 1 of 1', 'no visible view', [], true)
    );

    await expect(calls.playSteps!(SCENE_ID)).resolves.toMatchObject({ missing: { tap: 'Inbox' } });
  });

  it("any other failed step is kept as the scene's own error, and the steps before it are answered", async () => {
    behind.playSteps.mockRejectedValue(
      new SherloStepError(SCENE_ID, 'step 2 of 3', 'no app takes it', ['tap testID "Connections"'])
    );

    await expect(calls.playSteps!(SCENE_ID)).resolves.toEqual({
      played: [{ tap: 'Connections' }],
    });
    expect(readStoryError(SCENE_ID)?.message).toContain('no app takes it');
  });

  it('a ready wait that showed its views answers them, one that timed out answers the route it stayed on', async () => {
    behind.awaitReady.mockResolvedValueOnce({ outcome: 'shown' });
    behind.awaitReady.mockResolvedValueOnce({
      outcome: 'timed-out',
      route: ['Home', 'Chat'],
      line: 'not ready',
    });

    await expect(calls.awaitReady!(SCENE_ID)).resolves.toEqual({
      outcome: 'shown',
      ready: 'chat, composer',
    });
    await expect(calls.awaitReady!(SCENE_ID)).resolves.toEqual({
      outcome: 'timed-out',
      ready: 'chat, composer',
      stayedOn: ['Home', 'Chat'],
    });
  });

  it('a ready wait that only waited out views answers the views that left', async () => {
    behind.scene.ready = { gone: 'spinner' };
    behind.awaitReady.mockResolvedValue({ outcome: 'gone' });

    await expect(calls.awaitReady!(SCENE_ID)).resolves.toEqual({
      outcome: 'gone',
      gone: ['spinner'],
    });
  });

  it("hands the core the SDK's own record helpers: the rules proof, the threw, the cause and the asset check", () => {
    expect(calls.rulesInstalledProof).toBe(rulesInstalledProof);
    expect(calls.threwOf).toBe(threwOf);
    expect(calls.causeOfCrash).toBe(causeOfCrash);
    expect(calls.isBundlerAssetUrl).toBe(isBundlerAssetUrl);
    expect(calls.causeOfCrash!('no-such-scene')).toMatchObject({ name: 'AppCrashed' });
  });

  it('a ready wait that ended on an error the scene threw does not throw', async () => {
    behind.awaitReady.mockRejectedValue(new Error('the scene threw'));

    await expect(calls.awaitReady!(SCENE_ID)).resolves.toMatchObject({ outcome: 'timed-out' });
  });
});
