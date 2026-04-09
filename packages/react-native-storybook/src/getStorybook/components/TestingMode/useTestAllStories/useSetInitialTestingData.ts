import { useEffect } from 'react';
import { RunnerBridge } from '../../../../helpers';
import SherloModule from '../../../../SherloModule';
import prepareSnapshots from './prepareSnapshots';
import { isStorybook7 } from '../../../helpers';
import { StorybookView } from '../../../../types';

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

async function waitForStorybookReady(view: StorybookView): Promise<boolean> {
  const viewAny = view as any;

  // Wait for the Storybook preview store to finish initializing.
  // If it rejects, log the error for diagnostics and bail out.
  try {
    await viewAny._preview?.ready?.();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    RunnerBridge.log('waitForStorybookReady: preview.ready rejected', { error: msg });
    return false;
  }

  // preview.ready() resolved → storyStoreValue is set.
  // If _idToPrepared is still empty (the useEffect in getStorybookUI hasn't fired yet,
  // or createPreparedStoryMapping failed silently), call it directly.
  if (Object.keys(view._idToPrepared).length === 0) {
    RunnerBridge.log('waitForStorybookReady: _idToPrepared empty after preview ready, retrying');
    try {
      await viewAny.createPreparedStoryMapping?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      RunnerBridge.log('waitForStorybookReady: createPreparedStoryMapping failed', {
        error: msg,
        storyIndexEntries: Object.keys(viewAny._storyIndex?.entries ?? {}).length,
      });
    }
  }

  // Brief polling in case useEffect populates _idToPrepared asynchronously
  // after the direct createPreparedStoryMapping call above.
  for (let i = 0; i < 20; i++) {
    if (Object.keys(view._idToPrepared).length > 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  RunnerBridge.log('waitForStorybookReady: timed out', {
    idToPreparedCount: Object.keys(view._idToPrepared).length,
    storyIndexEntries: Object.keys(viewAny._storyIndex?.entries ?? {}).length,
  });

  return Object.keys(view._idToPrepared).length > 0;
}
