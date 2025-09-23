import type { start } from '@storybook/react-native';
import { useEffect } from 'react';
import { RunnerBridge } from '../../../../helpers';
import SherloModule from '../../../../SherloModule';
import prepareSnapshots from './prepareSnapshots';
import { isStorybook7 } from '../../../helpers';

function useSetInitialTestingData({ view }: { view: ReturnType<typeof start> }): void {
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
  }, []);
}

export default useSetInitialTestingData;

/* ========================================================================== */

async function waitForStorybookReady(view: ReturnType<typeof start>): Promise<boolean> {
  while (true) {
    const isReady = Object.keys(view._idToPrepared).length > 0;

    if (isReady) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
