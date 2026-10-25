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
 *
 * A capture launch of an app with its own Storybook also installs, here and before the app's entry,
 * the wrapper provider that wraps the app's root in the scene's view (./storyOfTheApp); an entry
 * that sets its own provider later wins.
 */
import SherloModule from './SherloModule';
import announceAppShowsWhatItTests from './helpers/announceAppShowsWhatItTests';
import reportStorybookLoaded from './helpers/reportStorybookLoaded';
import bundledScenes from './bundledScenes';
import { sceneOfTheCaptureOfAnAppWithStorybook } from './captureLaunch';
import { startCaptureOfTheLaunch } from './captureTransport';
import { activateSceneMocks } from './getStorybook/storyMockActivation';
import { readStorybookFacts } from './getStorybook/storybookFacts';
import { getSealedCore } from './sealedCore/loadSealedCore';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { collectAppMetadata } from './appMetadata';
import { isDrivenByRunner, walkTheStoryForTheRunner } from './runnerWalk';
import { installTheWrapperThatWrapsWhenSherlosStorybookIsAbsent } from './storyOfTheApp';
import type { SceneFile } from './scenes';

// Set once a copy of this module has run: an app that holds two copies of the SDK switches the
// scene on once.
const SWITCHED_ON_FLAG = '__sherloLaunchedSceneSwitchedOn';

/**
 * The story batch launch of an app that holds scenes and no Storybook: no component of the SDK is
 * rendered to start the test session, so it is started here, once the bundle's main module has run
 * and Storybook, if the app has it, has recorded its facts (an app with Storybook keeps its own
 * road: ./getStorybook/components/TestingMode). The core lists the scenes in START.
 *
 * Every testing-mode launch of such an app, with a scene named or not, also tells the watchdogs the
 * app is up and the runner it takes scenes: no Storybook wrapper renders and no getStorybook() runs
 * to do it. A launch that names a scene starts no session here: when a runner drives it (the
 * bundle came from the device, not a bundler), the scene goes to the core's testStory, the call the
 * Storybook road makes (./getStorybook/components/TestingMode/useTestAllStories/useTestStory),
 * which waits until the scene is ready and answers the runner.
 */
function startTheSessionOfAnAppWithoutStorybook(sceneId: string | undefined): void {
  if (Object.keys(bundledScenes).length === 0) return;
  // Synchronously, before the app's entry runs: an entry that sets its own wrapper later wins, and
  // the wrapper decides at render whether it wraps (./storyOfTheApp). Both setups run this module
  // before the main module (metro/withStorybook.js, withSceneBoot).
  if (sceneId) installTheWrapperThatWrapsWhenSherlosStorybookIsAbsent();
  Promise.resolve().then(() => {
    // Storybook is there, but Sherlo's getStorybook may never run (the app starts its own): a
    // capture launch asks for its capture either way, and the core starts it once while collecting.
    if (sceneOfTheCaptureOfAnAppWithStorybook()) {
      startCaptureOfTheLaunch();
      return;
    }
    if (readStorybookFacts()) return;
    if (!sceneId) getSealedCore()?.startTestSession();
    announceAppShowsWhatItTests();
    reportStorybookLoaded();
    if (sceneId && isDrivenByRunner()) {
      // Before the safe area settles, the Storybook road's insets are zero too.
      walkTheStoryForTheRunner({
        insets: {
          top: initialWindowMetrics?.insets.top ?? 0,
          bottom: initialWindowMetrics?.insets.bottom ?? 0,
        },
        collectMetadata: collectAppMetadata,
      });
    }
  });
}

function switchOnTheLaunchedScene(): void {
  const host = globalThis as Record<string, unknown>;
  if (host[SWITCHED_ON_FLAG]) return;
  host[SWITCHED_ON_FLAG] = true;

  if (SherloModule.getMode() !== 'testing') return;
  const sceneId = SherloModule.getLastState()?.nextSnapshot.storyId;
  startTheSessionOfAnAppWithoutStorybook(sceneId || undefined);
  if (!sceneId) return;
  const scene = bundledScenes[sceneId];
  // An id this bundle holds no scene for is a story's, launched the same way, or a scene the
  // bundle lacks. The launch cannot tell the two apart, the capture can: each of the app's waits
  // says the scenes the bundle holds (./captureTransport), and the bundler refuses a scene it lacks.
  if (!scene) return;

  const file = (scene.loadFile() as { default?: SceneFile } | undefined)?.default;
  activateSceneMocks(sceneId, file?.mocks, file?.scenes[scene.sceneName]?.mocks, scene.filePath);
}

switchOnTheLaunchedScene();
