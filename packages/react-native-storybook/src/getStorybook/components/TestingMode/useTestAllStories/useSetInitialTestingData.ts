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

  // Storybook RN v10+ populates view._idToPrepared lazily via createPreparedStoryMapping.
  // v8/v9 auto-populated. Optional-call kicks the eager-load path on v10 without
  // breaking older versions that don't expose this method.
  const eagerLoad = (view as unknown as { createPreparedStoryMapping?: () => Promise<void> })
    .createPreparedStoryMapping;
  if (typeof eagerLoad === 'function') {
    try {
      await eagerLoad.call(view);
    } catch (_) {
    }
  }

  while (true) {
    const isReady = Object.keys(view._idToPrepared).length > 0;

    if (isReady) {
      return true;
    }

    if (Date.now() >= deadline) {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
