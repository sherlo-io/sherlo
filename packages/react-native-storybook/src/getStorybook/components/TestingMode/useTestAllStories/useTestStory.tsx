import { useEffect } from 'react';
import { RunnerBridge } from '../../../../helpers';
import SherloModule from '../../../../SherloModule';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MetadataProviderRef } from '../MetadataProvider';
import { prepareInspectorData } from './prepareInspectorData';
import { readStoryError, clearStoryError } from '../../../storyErrorRegistry';
import { Config } from '../../../../helpers/RunnerBridge/types';
import { StorybookView } from '../../../../types';
import { getStorybookChannel, waitForStoryRendered } from './storyRenderedReadiness';

// SHERLO-1497 readiness defaults, applied SDK-side so an OLD runner that omits
// these fields still works. Documented in Config (RunnerBridge/types.ts).
const READINESS_DEFAULTS = {
  scrollableFallbackDelayMs: 3000,
  storyRenderedTimeoutMs: 5000,
  paintBarrierTimeoutMs: 1000,
  paintBarrierPerScrollPart: true,
} as const;

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
    paintBarrierTimeoutMs:
      config.paintBarrierTimeoutMs ?? READINESS_DEFAULTS.paintBarrierTimeoutMs,
    paintBarrierPerScrollPart:
      config.paintBarrierPerScrollPart ?? READINESS_DEFAULTS.paintBarrierPerScrollPart,
  };
}

/**
 * Run the native paint barrier (force a redraw, resolve on the next real frame
 * commit). Best-effort: on timeout/error we warn and proceed - the stability
 * loop runs afterwards regardless (design decision 3).
 */
async function runPaintBarrier(readiness: ReadinessConfig, context: Record<string, any>): Promise<void> {
  const painted = await SherloModule.awaitFrameCommit(readiness.paintBarrierTimeoutMs).catch((error) => {
    RunnerBridge.log('paint barrier error', { error: error?.message, ...context });
    return false;
  });
  RunnerBridge.log('paint barrier', {
    painted,
    timeoutMs: readiness.paintBarrierTimeoutMs,
    ...context,
  });
}

/**
 * New readiness path (SHERLO-1497): wait for Storybook's STORY_RENDERED (exact
 * storyId), or fall back to the configured scrollable delay, then run the native
 * paint barrier - so the stability loop that follows settles on real painted
 * content rather than a frozen spinner or blank.
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
  const channel = getStorybookChannel(view);
  const result = await waitForStoryRendered({
    storyId,
    timeoutMs: readiness.storyRenderedTimeoutMs,
    channel,
  });
  RunnerBridge.log('readiness result', {
    path: result.path,
    rendered: result.rendered,
    waitedMs: result.waitedMs,
  });

  if (!result.rendered) {
    // STORY_RENDERED never arrived (timeout) or no channel was reachable.
    // For scrollable snapshots wait the configured fallback before stabilizing.
    const probe = await SherloModule.isScrollable().catch(() => ({ scrollable: false }));
    if (probe.scrollable) {
      RunnerBridge.log('readiness fallback delay (scrollable)', {
        delayMs: readiness.scrollableFallbackDelayMs,
      });
      await delay(readiness.scrollableFallbackDelayMs);
    } else {
      RunnerBridge.log('readiness fallback skipped (not scrollable)');
    }
  }

  await runPaintBarrier(readiness, { phase: 'initial' });
}

function useTestStory({
  metadataProviderRef,
  view,
}: {
  metadataProviderRef: React.RefObject<MetadataProviderRef>;
  view?: StorybookView;
}): void {
  const config = SherloModule.getConfig();
  const lastState = SherloModule.getLastState();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async (): Promise<void> => {
      try {
        if (!lastState) return;

        const { nextSnapshot, requestId } = lastState;

        RunnerBridge.log('attempt to test story', {
          nextSnapshot,
          requestId,
        });

        // SHERLO-1497 feature flag (DEFAULT-OFF). With it off the legacy
        // substring-poll + grab-at-timeout behavior is byte-for-byte preserved.
        const useReadiness = config.useStoryRenderedReadiness === true;
        const readiness = resolveReadinessConfig(config);

        // We wait until the story is displayed in the UI
        // before we start stabilizing and taking screenshots
        // This is to avoid taking screenshots of the loading state
        if (useReadiness) {
          // Observability: log BOTH the readiness config received from the
          // runner and the values actually applied after defaults. Confirming a
          // value is honored is a log read, not an investigation.
          RunnerBridge.log('readiness config', {
            received: {
              useStoryRenderedReadiness: config.useStoryRenderedReadiness,
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
        } else {
          let storyIsDisplayed = false;
          let waitCount = 0;
          do {
            await new Promise((resolve) => setTimeout(resolve, 500));
            waitCount++;

            const controlFabricMetadata = JSON.stringify(
              metadataProviderRef?.current?.collectMetadata()
            );

            if (controlFabricMetadata.includes(nextSnapshot.storyId)) {
              RunnerBridge.log('story is displayed', {
                waitCount,
              });
              storyIsDisplayed = true;
            } else {
              RunnerBridge.log('story is not displayed', {
                waitCount,
              });
            }
          } while (!storyIsDisplayed);
        }

        const isStable = await SherloModule.stabilize(
          config.stabilization.requiredMatches,
          config.stabilization.minScreenshotsCount,
          config.stabilization.intervalMs,
          config.stabilization.timeoutMs,
          !!config.stabilization.saveScreenshots,
          config.stabilization.threshold,
          config.stabilization.includeAA
        ).catch((error) => {
          RunnerBridge.log('error checking if stable', { error: error.message });
          throw error;
        });

        RunnerBridge.log('checked if stable', { isStable });

        let inspectorData;
        const inspectorDataStart = Date.now();
        while (!inspectorData) {
          if (Date.now() - inspectorDataStart > 10000) {
            RunnerBridge.log('getInspectorData timed out after 10s');
            throw new Error('getInspectorData timed out after 10s');
          }
          inspectorData = await SherloModule.getInspectorData().catch((error) => {
            RunnerBridge.log('error getting inspector data', { error: JSON.stringify(error) });
          });
        }

        RunnerBridge.log('got inspector data');

        const fabricMetadata = metadataProviderRef?.current?.collectMetadata();

        RunnerBridge.log('got fabric metadata');

        const recordedError = readStoryError(nextSnapshot.storyId);
        const containsError =
          recordedError !== undefined ||
          fabricMetadata?.texts.includes('Something went wrong rendering your story');

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
          const scrollableResult = await SherloModule.isScrollable().catch((error) => {
            RunnerBridge.log('error checking if scrollable', { error: error.message });
            return { scrollable: false, scrollViewFrame: undefined };
          });

          isScrollable = scrollableResult.scrollable;
          scrollViewFrame = scrollableResult.scrollViewFrame;

          RunnerBridge.log('checked if scrollable', { isScrollable, scrollViewFrame });

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
        RunnerBridge.log('requesting screenshot from master script', {
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

        let response = await RunnerBridge.send({
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
          RunnerBridge.log('received ACK_SCROLL_REQUEST', { scrollIndex, offsetPx, nextRequestId });

          if (nextRequestId) {
            currentRequestId = nextRequestId;
          }

          let isStableAfterScroll = true;

          if (scrollIndex > 0) {
             // Scroll to target
             const scrollResult = await SherloModule.scrollToCheckpoint(
               scrollIndex,
               offsetPx,
               50 // Guardrail max index
             ).catch((error) => {
               RunnerBridge.log('error scrolling to checkpoint', { error: error.message });
               throw error;
             });

             // Check if we reached bottom locally
             if (scrollResult.reachedBottom) {
                RunnerBridge.log('reached bottom locally during scroll');
                isAtEnd = true;
             }

             // SHERLO-1497: re-run the native paint barrier for this scroll part
             // so the post-scroll stabilize settles on freshly-painted content.
             if (useReadiness && readiness.paintBarrierPerScrollPart) {
               await runPaintBarrier(readiness, { phase: 'scroll-part', scrollIndex });
             }

             // Stabilize
             isStableAfterScroll = await SherloModule.stabilize(
                config.stabilization.requiredMatches,
                config.stabilization.minScreenshotsCount,
                config.stabilization.intervalMs,
                config.stabilization.timeoutMs,
                !!config.stabilization.saveScreenshots,
                config.stabilization.threshold,
                config.stabilization.includeAA
              ).catch((error) => {
                RunnerBridge.log('error stabilizing after scroll', { error: error.message });
                throw error;
              });

              if (!isStableAfterScroll) {
                 RunnerBridge.log('warning: UI not stable after scroll');
              }
              currentScrollOffset = scrollResult.appliedOffsetPx;

              // Recapture Metadata after scroll to get dynamic elements (below fold)
              let newInspectorData;
              const scrollInspectorStart = Date.now();
              while (!newInspectorData) {
                 if (Date.now() - scrollInspectorStart > 10000) {
                   RunnerBridge.log('getInspectorData (scroll) timed out after 10s');
                   throw new Error('getInspectorData (scroll) timed out after 10s');
                 }
                 newInspectorData = await SherloModule.getInspectorData().catch((error) => {
                     RunnerBridge.log('error getting inspector data (scroll)', { error: JSON.stringify(error) });
                 });
              }

              const newFabricMetadata = metadataProviderRef?.current?.collectMetadata();
              
              if (newInspectorData) {
                  const prepared = prepareInspectorData(
                      newInspectorData,
                      newFabricMetadata!,
                      nextSnapshot.storyId // We assume story ID doesn't change
                  );
                  finalInspectorData = prepared.inspectorData;
                  hasNetworkImage = prepared.hasNetworkImage;
              }
          }
          
          checkpointIndex = scrollIndex;

          // Send next part
          RunnerBridge.log('requesting next screenshot part', {
            scrollIndex: checkpointIndex,
            requestId: currentRequestId,
            isAtEnd,
            scrollOffset: currentScrollOffset,
          });

          response = await RunnerBridge.send({
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
        clearStoryError(nextSnapshot.storyId);
      } catch (error) {
        // @ts-ignore
        RunnerBridge.log('story capturing failed', { errorMessage: error?.message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useTestStory;
