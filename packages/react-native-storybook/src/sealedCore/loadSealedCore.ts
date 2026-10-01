/**
 * LOADING THE SEALED CORE: once per launch, in every mode, when the SDK is imported.
 *
 * The core is not part of the app's JavaScript bundle. Native code picks it - a newer core Sherlo
 * signed, from the app's storage folder, or else the one shipped inside the SDK - and hands its
 * source over through the synchronous `loadCore()`. It is evaluated here, checked for the seam this
 * SDK speaks, and installed with the host (./seam).
 *
 * Nothing here ever throws. No core - a native build with no loader, a core that throws, a core of
 * another seam - leaves Storybook rendering and mocking working, with Sherlo's own features off:
 * every feature that needs the core asks getSealedCore() first. In testing mode the missing core
 * also fails the compatibility check (../checkSdkCompatibility), so a run never goes on silently.
 */
import { NativeModules } from 'react-native';
import TurboModule from '../specs/NativeSherloModule';
import SherloModule from '../SherloModule';
import RunnerBridge from '../helpers/RunnerBridge';
import { setCaptureLogSink } from '../helpers/RunnerBridge/captureLogSink';
import { bundlerOrigin } from '../bundlerOrigin';
import {
  clearStoryError,
  readStoryError,
  recordStoryError,
} from '../getStorybook/storyErrorRegistry';
import { STORY_ERROR_FALLBACK_TEXT } from '../constants';
import { getStorybookChannel } from '../getStorybook/storybookChannel';
import { activateMocksForStory } from '../getStorybook/storyMockActivation';
import { mergeStoryMocks } from '../mocking/mergeMocks';
import { clearMocks } from '../mocking';
import { collectAppMetadata, providerFirstRenderedAt } from '../appMetadata';
import { storyOfTheAppFiber } from '../componentNames';
import { sherloFetch } from '../mocking/network';
import type { SealedCore, SealedCoreHost } from './seam';

/** The number of the contract (./seam) this SDK speaks. A core of any other is never installed. */
const SEAM_THIS_SDK_SPEAKS = 1;

/** What native code's `loadCore()` answers, as JSON (SherloCoreLoader on iOS and Android). */
type NativeCorePick = {
  source: string | null;
  origin: 'override' | 'shipped' | 'none';
  version: string | null;
  /** Why a core in the storage folder was refused, or why there is no core at all. */
  reason: string | null;
};

type LoadedCore =
  | { core: SealedCore; whyThereIsNoCore: null }
  | { core: null; whyThereIsNoCore: string };

let loadedCore: LoadedCore | undefined;

/** Load the core, the first time it is asked for; every later call answers the same. */
export function loadSealedCore(): LoadedCore {
  if (!loadedCore) loadedCore = loadOnce();
  return loadedCore;
}

/** The installed core, or null when there is none and Sherlo's features are off. */
export function getSealedCore(): SealedCore | null {
  return loadSealedCore().core;
}

function loadOnce(): LoadedCore {
  try {
    const nativeModule = TurboModule ?? NativeModules.SherloModule;
    if (typeof nativeModule?.loadCore !== 'function') {
      // Expo Go, or a native build from before the loader. Not worth a warning outside a run:
      // testing mode reports it through the compatibility check.
      return { core: null, whyThereIsNoCore: 'This native build of Sherlo has no core loader.' };
    }

    const pick = JSON.parse(nativeModule.loadCore()) as NativeCorePick;
    if (!pick.source) return withoutCore(`Sherlo found no core to run: ${pick.reason}`);

    // Indirect eval runs the source in global scope, where the core puts __SHERLO_CORE__. Hermes
    // runs source, so one core file fits every Hermes version.
    // eslint-disable-next-line no-eval
    (0, eval)(pick.source);

    const core = globalThis.__SHERLO_CORE__;
    if (!core) return withoutCore("Sherlo's core put nothing on __SHERLO_CORE__.");
    if (core.seam !== SEAM_THIS_SDK_SPEAKS) {
      return withoutCore(
        `Sherlo's core speaks seam ${core.seam}, and this SDK speaks seam ${SEAM_THIS_SDK_SPEAKS}.`
      );
    }

    core.install(hostForTheCore());
    return { core, whyThereIsNoCore: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return withoutCore(`Sherlo's core failed to load: ${message}`);
  }
}

function withoutCore(why: string): LoadedCore {
  console.warn(`@sherlo/react-native-storybook: ${why} Sherlo's features are off.`);
  return { core: null, whyThereIsNoCore: why };
}

/** Everything the core may reach. It imports nothing, so this is all of it. */
function hostForTheCore(): SealedCoreHost {
  return {
    native: SherloModule,
    runner: { send: RunnerBridge.send, log: RunnerBridge.log },
    bundlerOrigin,
    storyErrors: {
      record: recordStoryError,
      read: readStoryError,
      clear: clearStoryError,
      fallbackText: STORY_ERROR_FALLBACK_TEXT,
    },
    storybookChannelOf: getStorybookChannel,
    activateMocksForStory,
    clearMocks,
    mergeStoryMocks,
    collectAppMetadata,
    providerFirstRenderedAt,
    storyOfTheAppFiber,
    setCaptureLogSink,
    warn: (message) => console.warn(message),
    // Sherlo's own fetch is the real one from before any story's mock wrapped it.
    fetch: sherloFetch,
  };
}
