import React, { ReactElement, useEffect, useRef } from 'react';
import SherloModule from '../SherloModule';
import checkSdkCompatibility, {
  __resetCacheForTests as checkSdkCompatibilityReset,
} from '../checkSdkCompatibility';
import type { InitialSelection } from '@storybook/react-native';
import { StorybookParams, StorybookView } from '../types';
import { TestingMode } from './components';
import { getStorybookComponent } from './helpers';
import { useHideSplashScreen } from './hooks';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import reportStorybookLoaded from '../helpers/reportStorybookLoaded';
import {
  clearStorybooksStory,
  readStorybookChannel,
  readStorybooksCurrentStory,
} from './storybookReads';
import { clearMocks } from '../mocking';
import {
  startOpenStoryChannel,
  stopOpenStoryChannel,
  whenStorybookShowsAStory,
} from '../openStoryChannel';
import { bundlerCapture, startCaptureTransport } from '../captureTransport';
import type { CaptureTransport, StorybookChannel } from '../sealedCore/seam';
import type { CaptureInstructionOfTheLine } from '../../metro/sherloLine';
import { getSealedCore } from '../sealedCore/loadSealedCore';

let isSdkCompatible = true;
if (SherloModule.getMode() === 'testing') {
  isSdkCompatible = checkSdkCompatibility();
}

/**
 * Whether a test walk can run in this launch: the SDK matches its native side, and the sealed core
 * that will hold the walk is installed. Without the core, testing mode renders nothing.
 */
function canWalkTheStories(): boolean {
  return isSdkCompatible && getSealedCore() !== null;
}

function getStorybook(view: StorybookView, params?: StorybookParams): () => ReactElement {
  const mode = SherloModule.getMode();

  // Cancel the native NOT_DISPLAYED watchdog: SDK is being activated.
  // Safe in all modes: the dummy SherloModule is a no-op; the real native
  // implementation is idempotent (safe to call even after the timer fired).
  SherloModule.notifyGetStorybookCalled();

  // Start waiting on the bundler's capture address, in every mode. Unlike the letterbox - which
  // only matters while Storybook is on screen - a capture can be asked for at any time, and
  // answering one restarts the app into testing mode: the app that comes back is in testing mode,
  // and it must still be listening for the capture that is waiting for it. startCaptureTransport is
  // idempotent and cheap, so starting it unconditionally costs a built app nothing (no bundler
  // beside it, nothing starts - see captureTransport's `bundlerCapture`).
  startWaitingForACapture(view);

  // Sherlo's decorator, its render delay and the hold that installs each story's mocks were
  // handed to Storybook's start() as one annotation of Sherlo's (./sherloAnnotation), so there is
  // nothing to add to Storybook here. When the SDK is not compatible the component returns null.
  if (mode === 'testing' && canWalkTheStories()) {
    // Attach the core's early STORY_RENDERED listener here - the earliest JS access to
    // the Storybook channel - so a story that renders before useTestStory mounts
    // is buffered, not missed. canWalkTheStories() above means the core is installed.
    try {
      getSealedCore()?.startStoryRenderedTracking(readStorybookChannel(view).value);
    } catch (_e) {}
  }

  if (mode === 'storybook') {
    let initialStoryId: string | undefined;
    try {
      const config = SherloModule.getConfig();
      initialStoryId = config.inspect?.initialStoryId;
      // Force shouldPersistSelection:false so inspect.initialStoryId always wins
      // over persisted AsyncStorage state from a previous launch.
      params = {
        ...(params ?? {}),
        shouldPersistSelection: false,
        ...(initialStoryId && { initialSelection: initialStoryId as InitialSelection }),
      };
    } catch (_e) {}

    // Start waiting on the bundler's letterbox, so `sherlo open --story <id>` reaches this app.
    // Here rather than in a hook for the same reason as the listener above: the letterbox opens
    // once Storybook has shown its own first story (see openStoryChannel), and a listener attached
    // after that story rendered would wait for it for ever.
    startWaitingOnTheLetterbox(view, true);
  }

  // An app showing ITSELF waits on the same address, and is sent to the story browser when a story
  // is posted for it - which is the whole point of `sherlo open`: see one story right now, rather
  // than launch the app and go and find it. Getting there restarts the app, so this side collects
  // nothing; the letterbox holds the story until the storybook-mode listener above asks for it.
  //
  // This is the ONE thing Sherlo does in default mode, and it costs a store build nothing: a built
  // app's JavaScript came from a file on the device rather than from a bundler, so there is no
  // address to wait on and nothing starts (see openStoryChannel's `bundlerLetterbox`).
  if (mode === 'default') {
    startWaitingOnTheLetterbox(view, false);
  }

  const isTestingMode = mode === 'testing';
  const isStorybookMode = mode === 'storybook';

  return function SherloStorybookEntry() {
    useHideSplashScreen();

    const storybookLoadedReported = useRef(false);

    // Emit STORYBOOK_LOADED after the first render commits so the runner only
    // sees the signal once the React tree is actually mounted.  Emitting it
    // synchronously inside patchedStart() (before any render) caused the runner
    // to mis-classify a mid-render crash as storybookNotDisplayed instead of
    // appFailedToStart.
    useEffect(() => {
      if (!isTestingMode) return;
      if (storybookLoadedReported.current) return;
      storybookLoadedReported.current = true;
      reportStorybookLoaded();
    }, []);

    // Leaving Storybook (unmount) passes every module through to real again, and stops waiting on
    // the bundler's letterbox - an app that is no longer showing Storybook has nowhere to put a
    // story.
    useEffect(() => {
      if (!isStorybookMode) return;
      return () => {
        clearMocks();
        stopOpenStoryChannel();
      };
    }, []);

    if (isTestingMode) {
      if (!canWalkTheStories()) return null as unknown as ReactElement;

      return (
        <SafeAreaProvider>
          <TestingMode view={view} params={params} />
        </SafeAreaProvider>
      );
    }

    const Storybook = getStorybookComponent({ view, params });

    return <Storybook />;
  };
}

export default getStorybook;

/* ========================================================================== */

function startWaitingOnTheLetterbox(view: StorybookView, atTheStoryBrowser: boolean): void {
  try {
    startOpenStoryChannel({ view, channel: readStorybookChannel(view).value, atTheStoryBrowser });
  } catch (_e) {
    // Ignored: a Storybook whose channel this could not read, or a device with no reachable
    // bundler beside it. Either one costs `sherlo open` its road into this app and costs the app
    // nothing else, so it is not worth crashing the app a developer is working in.
  }
}

function startWaitingForACapture(view: StorybookView): void {
  try {
    const channel = readStorybookChannel(view).value;
    const road = bundlerCapture();
    startCaptureTransport({
      channel,
      capture: road && channel ? startingEachStoryFresh(road, view, channel) : road,
    });
  } catch (_e) {
    // Ignored: a device with no reachable bundler beside it. That costs `sherlo capture` its road
    // into this app and costs the app nothing else, so it is not worth crashing the app a
    // developer is working in.
  }
}

/** How long a fresh start waits for Storybook to draw the story again before the core walks it. */
const FRESH_START_TIMEOUT_MS = 5000;

/**
 * The bundler's road, with each story capture starting from a fresh app state: when the line says
 * this JavaScript was last handed the same story (`startFresh`, ../../metro/sherloLine.js), the
 * story is drawn again from nothing before the core walks it. Without that, Storybook keeps the
 * story mounted, and the capture shows whatever the story drew after the last one.
 */
function startingEachStoryFresh(
  road: CaptureTransport,
  view: StorybookView,
  channel: StorybookChannel
): CaptureTransport {
  return {
    waitForACapture: async (saying) => {
      const asked = (await road.waitForACapture(saying)) as CaptureInstructionOfTheLine;
      if (asked.startFresh && asked.storyId) await drawTheStoryAgain(view, channel, asked.storyId);
      return asked;
    },
  };
}

/**
 * Take the story off Storybook's view, and have Storybook draw it again: it mounts from nothing,
 * and Sherlo's decorator installs the story's mocks again before it does (./sherloAnnotation). It
 * does nothing when Storybook shows another story, which the core's walk mounts fresh anyway.
 */
async function drawTheStoryAgain(
  view: StorybookView,
  channel: StorybookChannel,
  storyId: string
): Promise<void> {
  if (readStorybooksCurrentStory(view).value !== storyId) return;
  if (clearStorybooksStory(view).value !== true) return;
  // The view must draw no story for one frame, or React would keep the story it hands back.
  await SherloModule.awaitFrameCommit(FRESH_START_TIMEOUT_MS).catch(() => false);

  await new Promise<void>((resolve) => {
    whenStorybookShowsAStory({ view, channel, timeoutMs: FRESH_START_TIMEOUT_MS }, resolve);
    channel.emit('forceRemount', { storyId });
  });
}

export function __resetForTests(): void {
  isSdkCompatible = true;
  checkSdkCompatibilityReset();
}
