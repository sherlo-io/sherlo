import checkSdkCompatibility from './checkSdkCompatibility';
import { send, startTheLine } from './connection/appLine';
import { JS_MODULE_VERSION } from './sdk-compatibility.json';
import SherloModule from './SherloModule';
import { loadSealedCore } from './sealedCore/loadSealedCore';

export { default as isRunningVisualTests } from './isRunningVisualTests';
export { default as isStorybookMode } from './isStorybookMode';
export { default as openStorybook } from './openStorybook';
export { mock } from './mocking/mockDeclaration';
export type { MockDeclaration } from './mocking/mockDeclaration';
export { mockRequest } from './mocking/networkDeclaration';
export type {
  HttpMethod,
  NetworkMockDeclaration,
  NetworkRule,
  RequestAnswer,
  RequestMatcher,
  SocketAnswer,
  SocketMatcher,
  SocketRule,
} from './mocking/networkDeclaration';
export { UnmockedRequestError } from './mocking/networkRules';
export { mockClock } from './mocking/clock';
export { mockRandom } from './mocking/random';
export { awaitReady } from './storyReady';
export type { ReadyOutcome } from './storyReady';
export type {
  LongPressStep,
  OpenStep,
  PlayStep,
  ReadyStep,
  SceneDevice,
  ScenePermission,
  TapStep,
  TapTarget,
  TypeStep,
} from './scenes';

export * from './types';

// The sealed core loads first, in every mode, so everything after it finds it installed. It never
// throws: with no core, Sherlo's features are off and the rest of the SDK still works.
loadSealedCore();

try {
  installSherloIntegration();
} catch (_) {}

function installSherloIntegration(): void {
  const isTesting = SherloModule.getMode() === 'testing';

  // The line starts in every mode: a bundler's `sherlo open` and `sherlo capture` reach an app that
  // is not in testing mode over it. Starting it sends this JavaScript's `hello`, and nothing else.
  startTheLine();

  if (isTesting) {
    send({ action: 'JS_EVAL_COMPLETE', jsVersion: JS_MODULE_VERSION });

    // Run SDK compatibility check BEFORE sending WITHSTORYBOOK_APPLIED.
    // checkSdkCompatibility() is idempotent: a second call from getStorybook.tsx returns
    // the cached result without calling sendNativeError again.
    let isSdkCompatible: boolean | null = null;
    try {
      isSdkCompatible = checkSdkCompatibility();
    } catch (_) {}

    // Only send WITHSTORYBOOK_APPLIED when SDK is compatible, so the runner reads the
    // compatibility error (NATIVE_ERROR) in place of a setup that looks in place.
    if ((global as any).__sherloWithStorybookApplied === true && isSdkCompatible !== false) {
      try {
        send({ action: 'WITHSTORYBOOK_APPLIED' });
      } catch (_) {}
    }
    if ((global as any).__sherloStorybookDisabledFlag === true) {
      try {
        send({ action: 'WITHSTORYBOOK_DISABLED' });
      } catch (_) {}
    }
  }
}

// The early-boot module, imported so every bundle that holds the SDK holds it: Sherlo's bundler
// config has Metro run it before the app's entry (./sceneBoot). Imported last, so a scene file it
// requires, which imports this module back, finds every export above already in place. It
// switches the scene on once, however many copies of the SDK the app imports.
import './sceneBoot';
