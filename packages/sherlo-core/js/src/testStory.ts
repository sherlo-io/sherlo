/**
 * A LAUNCH WITH A STORY: wait until the story is ready, report it to the runner, and report every
 * further part of a tall screen the runner asks for.
 *
 * Ready means three steps, in order: Storybook's rendered event for exactly this story, a paint
 * barrier, and a stillness loop. No step fails a story: when its time runs out, the walk goes on.
 * The messages it sends, and their order, are the runner's protocol with the app.
 *
 * The SDK's useTestStory hook calls this once, from its effect, and turns the story's mocks off
 * when it is done - mocking stays in the SDK.
 */
import type {
  Config,
  Metadata,
  SafeAreaInsets,
  OpaqueStorybookView as StorybookView,
} from '../../../react-native-storybook/src/sealedCore/seam';
import { theHost } from './host';
import { waitForStoryRendered } from './storyRenderedReadiness';
import { prepareInspectorData } from './prepareInspectorData';

// Readiness defaults, applied SDK-side so an OLD runner that omits
// these fields still works. Documented in Config (the SDK's RunnerBridge/types.ts).
const READINESS_DEFAULTS = {
  scrollableFallbackDelayMs: 3000,
  storyRenderedTimeoutMs: 5000,
  paintBarrierTimeoutMs: 1000,
  paintBarrierPerScrollPart: true,
} as const;

/** How long the walk asks the native side for the view tree before it drops the story. */
const INSPECTOR_DATA_TIMEOUT_MS = 10000;

/** The furthest scroll part the native side will scroll to: a guardrail, not a limit. */
const MAX_SCROLL_INDEX = 50;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type ReadinessConfig = {
  scrollableFallbackDelayMs: number;
  storyRenderedTimeoutMs: number;
  paintBarrierTimeoutMs: number;
  paintBarrierPerScrollPart: boolean;
};

function resolveReadinessConfig(config: Config): ReadinessConfig {
  return {
    scrollableFallbackDelayMs:
      config.scrollableFallbackDelayMs ?? READINESS_DEFAULTS.scrollableFallbackDelayMs,
    storyRenderedTimeoutMs:
      config.storyRenderedTimeoutMs ?? READINESS_DEFAULTS.storyRenderedTimeoutMs,
    paintBarrierTimeoutMs: config.paintBarrierTimeoutMs ?? READINESS_DEFAULTS.paintBarrierTimeoutMs,
    paintBarrierPerScrollPart:
      config.paintBarrierPerScrollPart ?? READINESS_DEFAULTS.paintBarrierPerScrollPart,
  };
}

/**
 * Run the native paint barrier (force a redraw, resolve on the next real frame
 * commit). Best-effort: on timeout/error we warn and proceed - the stability
 * loop runs afterwards regardless.
 */
async function runPaintBarrier(
  readiness: ReadinessConfig,
  context: Record<string, any>
): Promise<void> {
  const { native, runner } = theHost();
  const painted = await native.awaitFrameCommit(readiness.paintBarrierTimeoutMs).catch((error) => {
    runner.log('paint barrier error', { error: error?.message, ...context });
    return false;
  });
  runner.log('paint barrier', {
    painted,
    timeoutMs: readiness.paintBarrierTimeoutMs,
    ...context,
  });
}

/**
 * Wait for Storybook's STORY_RENDERED (exact storyId), or fall back to the
 * configured scrollable delay, then run the native paint barrier - so the
 * stability loop that follows settles on real painted content rather than a
 * frozen spinner or blank.
 */
async function awaitStoryReadyAndPaint({
  view,
  storyId,
  readiness,
}: {
  view: StorybookView | undefined;
  storyId: string;
  readiness: ReadinessConfig;
}): Promise<void> {
  const { native, runner, storybookChannelOf } = theHost();
  const result = await waitForStoryRendered({
    storyId,
    timeoutMs: readiness.storyRenderedTimeoutMs,
    channel: storybookChannelOf(view),
  });
  runner.log('readiness result', {
    path: result.path,
    rendered: result.rendered,
    waitedMs: result.waitedMs,
  });

  if (!result.rendered) {
    // STORY_RENDERED never arrived (timeout) or no channel was reachable.
    // For scrollable snapshots wait the configured fallback before stabilizing.
    const probe = await native.isScrollable().catch(() => ({ scrollable: false }));
    if (probe.scrollable) {
      runner.log('readiness fallback delay (scrollable)', {
        delayMs: readiness.scrollableFallbackDelayMs,
      });
      await delay(readiness.scrollableFallbackDelayMs);
    } else {
      runner.log('readiness fallback skipped (not scrollable)');
    }
  }

  await runPaintBarrier(readiness, { phase: 'initial' });
}

/** The native stillness loop, with the run's stabilization settings. True when the screen held still. */
function stabilize(stabilization: Config['stabilization']): Promise<boolean> {
  return theHost().native.stabilize(
    stabilization.requiredMatches,
    stabilization.minScreenshotsCount,
    stabilization.intervalMs,
    stabilization.timeoutMs,
    !!stabilization.saveScreenshots,
    stabilization.threshold,
    stabilization.includeAA
  );
}

/**
 * Ask the native side for the view tree until it answers one, for at most ten seconds; then throw,
 * which drops the story. `logSuffix` tells the first reading's log lines from a scroll part's.
 */
async function readInspectorData(logSuffix: '' | ' (scroll)') {
  const { native, runner } = theHost();
  let inspectorData;
  const start = Date.now();
  while (!inspectorData) {
    if (Date.now() - start > INSPECTOR_DATA_TIMEOUT_MS) {
      runner.log(`getInspectorData${logSuffix} timed out after 10s`);
      throw new Error(`getInspectorData${logSuffix} timed out after 10s`);
    }
    inspectorData = await native.getInspectorData().catch((error) => {
      runner.log(`error getting inspector data${logSuffix}`, { error: JSON.stringify(error) });
    });
  }
  return inspectorData;
}

export async function testStory({
  view,
  insets,
  collectMetadata,
}: {
  view: StorybookView | undefined;
  insets: SafeAreaInsets;
  collectMetadata: () => Metadata | undefined;
}): Promise<void> {
  const { native, runner, storyErrors } = theHost();

  try {
    // Every testing-mode boot carries a real config, whether it came from a run's own
    // config.sherlo or from the SDK defaults a capture hands across its restart -
    // getConfigOrDefault still reads through the dummy module outside a build wired to native at
    // all, which is the one absence left to fall back from.
    const config = native.getConfigOrDefault();

    // Whether there is a story queued to walk yet: a run's own first launch, before the runner has
    // answered START, has none.
    const lastState = native.getLastState();
    if (!lastState) return;

    const { nextSnapshot, requestId } = lastState;

    runner.log('attempt to test story', {
      nextSnapshot,
      requestId,
    });

    const readiness = resolveReadinessConfig(config);

    // We wait until the story is displayed in the UI
    // before we start stabilizing and taking screenshots
    // This is to avoid taking screenshots of the loading state.
    //
    // Observability: log BOTH the readiness config received from the
    // runner and the values actually applied after defaults. Confirming a
    // value is honored is a log read, not an investigation.
    runner.log('readiness config', {
      received: {
        scrollableFallbackDelayMs: config.scrollableFallbackDelayMs,
        storyRenderedTimeoutMs: config.storyRenderedTimeoutMs,
        paintBarrierTimeoutMs: config.paintBarrierTimeoutMs,
        paintBarrierPerScrollPart: config.paintBarrierPerScrollPart,
      },
      applied: readiness,
    });

    await awaitStoryReadyAndPaint({
      view,
      storyId: nextSnapshot.storyId,
      readiness,
    });

    const isStable = await stabilize(config.stabilization).catch((error) => {
      runner.log('error checking if stable', { error: error.message });
      throw error;
    });

    runner.log('checked if stable', { isStable });

    const inspectorData = await readInspectorData('');

    runner.log('got inspector data');

    const fabricMetadata = collectMetadata();

    runner.log('got fabric metadata');

    const recordedError = storyErrors.read(nextSnapshot.storyId);
    const containsError =
      recordedError !== undefined || fabricMetadata?.texts.includes(storyErrors.fallbackText);

    let finalInspectorData = inspectorData;
    let hasNetworkImage = false;
    let isScrollable = false;
    let scrollViewFrame: { x: number; y: number; width: number; height: number } | undefined;
    let safeAreaMetadata;

    if (!containsError) {
      if (fabricMetadata) {
        const preparedInspectorData = prepareInspectorData(
          inspectorData,
          fabricMetadata,
          nextSnapshot.storyId
        );
        finalInspectorData = preparedInspectorData.inspectorData;
        hasNetworkImage = preparedInspectorData.hasNetworkImage;
      }

      // Detect if the screen is scrollable for long-screenshot capture
      const scrollableResult = await native.isScrollable().catch((error) => {
        runner.log('error checking if scrollable', { error: error.message });
        return { scrollable: false, scrollViewFrame: undefined };
      });

      isScrollable = scrollableResult.scrollable;
      scrollViewFrame = scrollableResult.scrollViewFrame;

      runner.log('checked if scrollable', { isScrollable, scrollViewFrame });

      safeAreaMetadata = {
        shouldAddSafeArea: !nextSnapshot.parameters?.noSafeArea,
        insetBottom: Math.round(insets.bottom * finalInspectorData.density),
        insetTop: Math.round(insets.top * finalInspectorData.density),
      };
    }

    let checkpointIndex = 0;
    let currentRequestId = requestId;
    let isAtEnd = false;
    let currentScrollOffset = 0;

    // Initial Send
    runner.log('requesting screenshot from master script', {
      action: 'REQUEST_SNAPSHOT',
      hasError: containsError,
      finalInspectorData: !!finalInspectorData,
      isStable,
      isScrollable,
      requestId: currentRequestId,
      safeAreaMetadata,
      hasNetworkImage,
      isAtEnd,
      scrollOffset: currentScrollOffset,
    });

    let response = await runner.send({
      action: 'REQUEST_SNAPSHOT',
      storyId: nextSnapshot.storyId,
      error: recordedError,
      hasError: containsError,
      inspectorData: JSON.stringify(finalInspectorData),
      isStable,
      isScrollable,
      requestId: currentRequestId,
      safeAreaMetadata,
      hasNetworkImage,
      isAtEnd,
      scrollOffset: currentScrollOffset,
      scrollViewFrame,
    });

    // Loop if runner requests more scrolling
    while (response && response.action === 'ACK_SCROLL_REQUEST') {
      const { scrollIndex, offsetPx, requestId: nextRequestId } = response;
      runner.log('received ACK_SCROLL_REQUEST', { scrollIndex, offsetPx, nextRequestId });

      if (nextRequestId) {
        currentRequestId = nextRequestId;
      }

      let isStableAfterScroll = true;

      if (scrollIndex > 0) {
        // Scroll to target
        const scrollResult = await native
          .scrollToCheckpoint(scrollIndex, offsetPx, MAX_SCROLL_INDEX)
          .catch((error) => {
            runner.log('error scrolling to checkpoint', { error: error.message });
            throw error;
          });

        // Check if we reached bottom locally
        if (scrollResult.reachedBottom) {
          runner.log('reached bottom locally during scroll');
          isAtEnd = true;
        }

        // Re-run the native paint barrier for this scroll part
        // so the post-scroll stabilize settles on freshly-painted content.
        if (readiness.paintBarrierPerScrollPart) {
          await runPaintBarrier(readiness, { phase: 'scroll-part', scrollIndex });
        }

        isStableAfterScroll = await stabilize(config.stabilization).catch((error) => {
          runner.log('error stabilizing after scroll', { error: error.message });
          throw error;
        });

        if (!isStableAfterScroll) {
          runner.log('warning: UI not stable after scroll');
        }
        currentScrollOffset = scrollResult.appliedOffsetPx;

        // Recapture Metadata after scroll to get dynamic elements (below fold)
        const newInspectorData = await readInspectorData(' (scroll)');
        const newFabricMetadata = collectMetadata();

        const prepared = prepareInspectorData(
          newInspectorData,
          newFabricMetadata!,
          nextSnapshot.storyId // We assume story ID doesn't change
        );
        finalInspectorData = prepared.inspectorData;
        hasNetworkImage = prepared.hasNetworkImage;
      }

      checkpointIndex = scrollIndex;

      // Send next part
      runner.log('requesting next screenshot part', {
        scrollIndex: checkpointIndex,
        requestId: currentRequestId,
        isAtEnd,
        scrollOffset: currentScrollOffset,
      });

      response = await runner.send({
        action: 'REQUEST_SNAPSHOT',
        storyId: nextSnapshot.storyId,
        error: recordedError,
        hasError: containsError,
        inspectorData: JSON.stringify(finalInspectorData),
        isStable: isStableAfterScroll,
        isScrollable,
        requestId: currentRequestId,
        safeAreaMetadata,
        hasNetworkImage,
        isAtEnd,
        scrollOffset: currentScrollOffset,
        scrollViewFrame,
      });
    }
    storyErrors.clear(nextSnapshot.storyId);
  } catch (error) {
    runner.log('story capturing failed', {
      errorMessage: (error as { message?: string } | undefined)?.message,
    });
  }
}
