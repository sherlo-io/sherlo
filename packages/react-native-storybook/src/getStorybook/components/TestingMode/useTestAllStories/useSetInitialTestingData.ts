import { useEffect } from 'react';
import { RunnerBridge } from '../../../../helpers';
import SherloModule from '../../../../SherloModule';
import prepareSnapshots from './prepareSnapshots';
import { isStorybook7 } from '../../../helpers';
import { StorybookView } from '../../../../types';
import { STORYBOOK_LOAD_TIMEOUT_MS } from '../../../../constants';

function useSetInitialTestingData({ view }: { view: StorybookView }): void {
  const lastState = SherloModule.getLastState();

  useEffect(() => {
    if (lastState) return;

    (async () => {
      await waitForStorybookReady(view);

      const allStories = prepareSnapshots({ view, splitByMode: true });

      RunnerBridge.log('start testing session', {
        isStorybook7,
        storiesCount: allStories.length,
      });

      await RunnerBridge.send({
        action: 'START',
        snapshots: allStories,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useSetInitialTestingData;

/* ========================================================================== */

export async function waitForStorybookReady(view: StorybookView): Promise<boolean> {
  const TIMEOUT_MS = STORYBOOK_LOAD_TIMEOUT_MS;
  const POLL_INTERVAL_MS = 500;
  const deadline = Date.now() + TIMEOUT_MS;

  const eagerLoad = (view as unknown as { createPreparedStoryMapping?: () => Promise<void> })
    .createPreparedStoryMapping;

  RunnerBridge.log('waitForStorybookReady:start', {
    eagerLoadExists: typeof eagerLoad === 'function',
    storyIndexEntriesCount: Object.keys(
      ((view as unknown as { _storyIndex?: { entries?: Record<string, unknown> } })._storyIndex
        ?.entries) ?? {}
    ).length,
    idToPreparedCount: Object.keys(view._idToPrepared).length,
  });

  if (typeof eagerLoad === 'function') {
    const t0 = Date.now();
    try {
      await eagerLoad.call(view);
      RunnerBridge.log('waitForStorybookReady:eagerLoad:done', {
        ms: Date.now() - t0,
        idToPreparedCountAfter: Object.keys(view._idToPrepared).length,
      });
    } catch (err: any) {
      const previewProbe = (() => {
        try {
          const v = view as unknown as {
            _preview?: {
              getProjectAnnotations?: unknown;
              onGetProjectAnnotationsChanged?: unknown;
              ready?: unknown;
              getProjectAnnotationsCallback?: () => Promise<unknown>;
            };
          };
          const preview = v._preview;
          return {
            previewExists: !!preview,
            hasGetProjectAnnotations: typeof preview?.getProjectAnnotations === 'function',
            hasOnGetProjectAnnotationsChanged:
              typeof preview?.onGetProjectAnnotationsChanged === 'function',
            hasReady: typeof preview?.ready === 'function',
          };
        } catch (probeErr: any) {
          return { probeError: probeErr && probeErr.message };
        }
      })();

      RunnerBridge.log('waitForStorybookReady:eagerLoad:error', {
        ms: Date.now() - t0,
        message: err && err.message,
        name: err && err.name,
        stack: err && err.stack ? String(err.stack).slice(0, 800) : undefined,
        previewProbe,
      });
    }
  }

  let pollIter = 0;
  while (true) {
    const isReady = Object.keys(view._idToPrepared).length > 0;

    if (pollIter % 4 === 0) {
      RunnerBridge.log('waitForStorybookReady:poll', {
        iter: pollIter,
        idToPreparedCount: Object.keys(view._idToPrepared).length,
        isReady,
      });
    }
    pollIter++;

    if (isReady) {
      RunnerBridge.log('waitForStorybookReady:ready', {
        idToPreparedCount: Object.keys(view._idToPrepared).length,
      });
      return true;
    }

    if (Date.now() >= deadline) {
      RunnerBridge.log('waitForStorybookReady:timeout', {
        idToPreparedCount: Object.keys(view._idToPrepared).length,
      });
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
