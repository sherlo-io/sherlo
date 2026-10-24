/**
 * THE EARLY-BOOT MODULE: switches the launched scene's mocks on before the app's first module
 * runs, so a module that reads storage, the clock or a flag as it loads, or builds a socket class
 * at load, already meets the scene's fakes.
 *
 * Sherlo's bundler config names this module to Metro as one to run before the bundle's main
 * module, after React Native's own start-up modules (metro/withStorybook.js, withSceneBoot): those
 * install the globals the network mocks wrap. Metro runs such a module only when it is in the
 * bundle, so the SDK's entry imports it. A bundle made without Sherlo's config runs it when the
 * SDK is first imported, and finds no scenes (./bundledScenes).
 *
 * The scene comes from the launch: in testing mode, the story the launch was handed is the
 * scene's id. Its file is required here, the one app file required before the entry: a scene
 * file names its mocks by import, and an import runs nothing until it is asked.
 */
import SherloModule from './SherloModule';
import bundledScenes from './bundledScenes';
import { activateSceneMocks } from './getStorybook/storyMockActivation';
import { readStorybookFacts } from './getStorybook/storybookFacts';
import { getSealedCore } from './sealedCore/loadSealedCore';
import type { SceneFile } from './scenes';

// Set once a copy of this module has run: an app that holds two copies of the SDK switches the
// scene on once.
const SWITCHED_ON_FLAG = '__sherloLaunchedSceneSwitchedOn';

/**
 * The story batch launch of an app that holds scenes and no Storybook: no component of the SDK is
 * rendered to start the test session, so it is started here, once the bundle's main module has run
 * and Storybook, if the app has it, has recorded its facts (an app with Storybook keeps its own
 * road: ./getStorybook/components/TestingMode). The core lists the scenes in START.
 */
function startTheSessionOfAnAppWithoutStorybook(): void {
  if (Object.keys(bundledScenes).length === 0) return;
  Promise.resolve().then(() => {
    if (readStorybookFacts()) return;
    getSealedCore()?.startTestSession();
  });
}

function switchOnTheLaunchedScene(): void {
  const host = globalThis as Record<string, unknown>;
  if (host[SWITCHED_ON_FLAG]) return;
  host[SWITCHED_ON_FLAG] = true;

  if (SherloModule.getMode() !== 'testing') return;
  const sceneId = SherloModule.getLastState()?.nextSnapshot.storyId;
  if (!sceneId) {
    startTheSessionOfAnAppWithoutStorybook();
    return;
  }
  const scene = bundledScenes[sceneId];
  if (!scene) return;

  const file = (scene.loadFile() as { default?: SceneFile } | undefined)?.default;
  activateSceneMocks(sceneId, file?.mocks, file?.scenes[scene.sceneName]?.mocks, scene.filePath);
}

switchOnTheLaunchedScene();
