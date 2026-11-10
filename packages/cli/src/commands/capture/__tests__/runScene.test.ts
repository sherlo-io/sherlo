/**
 * The door every `sherlo capture` ending goes through (../runScene): what it keeps and saves, and
 * the app started again once the device is put back. The whole run of a scene is held by
 * capture.test.ts and the poses under poses/capture.
 */
import { describe, expect, it, vi } from 'vitest';
import { installCaptureSocket } from '../../../seams/captureSocket';
import type { SceneTarget } from '../../../seams/deviceState';
import type { SceneCaptureResult } from '../../../seams/liveScene';
import { keepTheCapture, runScene, savePicture } from '../runScene';

const phone = vi.hoisted(() => ({ installed: true, events: [] as string[] }));

vi.mock('../../../seams/deviceState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../seams/deviceState')>()),
  saveScreenPicture: async () => {
    throw new Error('no screen');
  },
  deviceState: () => ({ sceneTarget: async () => ON_A_SIMULATOR }),
  appIsInstalled: async () => phone.installed,
  prepareCleanDevice: async () => async () => {
    phone.events.push('put back');
  },
}));
vi.mock('../../../seams/sceneDevice', () => ({
  deviceOfScene: () => undefined,
  applySceneDevice: async () => [],
}));
vi.mock('../../../seams/declaredPermissions', () => ({ declaredPermissions: async () => ({}) }));
vi.mock('../../../seams/localCaptures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../seams/localCaptures')>()),
  newCapture: () => {
    throw new Error('nothing is kept in a test');
  },
}));
vi.mock('../../../seams/launchScene', () => ({
  relaunchWithNoScene: async () => {
    phone.events.push('relaunched with no scene');
  },
}));

const ON_A_SIMULATOR: SceneTarget = {
  device: { platform: 'ios', udid: 'SIM-1' },
  app: { id: 'com.example.app' },
};

/** Run one scene whose capture answers `answer`, or throws it when it is an error. */
async function runOneScene(answer: SceneCaptureResult | Error): Promise<string[]> {
  phone.events = [];
  const uninstall = installCaptureSocket({
    captureStory: async () => {
      throw new Error('a scene capture asked about a story');
    },
    captureScene: async () => {
      phone.events.push('the app answered');
      if (answer instanceof Error) throw answer;
      return answer;
    },
  });
  try {
    await runScene('chat--open', {}).catch((error: Error) => phone.events.push(error.message));
  } finally {
    uninstall();
  }
  return phone.events;
}

describe('what a capture keeps and saves', () => {
  it('keeps nothing when no folder was made for the capture', async () => {
    expect(await keepTheCapture(undefined, {}, undefined)).toBe(false);
  });

  it('gives a picture that could not be saved its own error and its path', async () => {
    const picture = await savePicture({} as never, './out.png');

    expect(picture).toEqual({ path: './out.png', error: 'no screen' });
  });
});

describe('the app once a scene capture has put the device back', () => {
  const NO_SUCH_SCENE: SceneCaptureResult = { kind: 'no-such-scene', sceneId: 'x', known: [] };

  it('is started again with no scene once the device is put back', async () => {
    phone.installed = true;

    expect(await runOneScene(NO_SUCH_SCENE)).toEqual([
      'the app answered',
      'put back',
      'relaunched with no scene',
    ]);
  });

  it('is started again after a scene capture that failed', async () => {
    phone.installed = true;

    expect(await runOneScene(new Error('the line broke'))).toEqual([
      'the app answered',
      'put back',
      'relaunched with no scene',
      'the line broke',
    ]);
  });

  it('is not started when nothing was put back, as for an app not on the device', async () => {
    phone.installed = false;

    expect(await runOneScene(NO_SUCH_SCENE)).toEqual([]);
  });
});
