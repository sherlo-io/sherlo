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
  while (true) {
    const isReady = Object.keys(view._idToPrepared).length > 0;

    if (isReady) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
