import { start } from '@storybook/react-native';
import { useEffect, useState } from 'react';
import { VERIFICATION_TEST_ID } from '../../../../constants';
import { SherloModule, RunnerBridge } from '../../../../helpers';
import { Snapshot } from '../../../../types';
import prepareSnapshots from './prepareSnapshots';
import { isStorybook7 } from '../../../helpers';

function useSetInitialTestingData({ view }: { view: ReturnType<typeof start> }): void {
  const lastState = SherloModule.getLastState();

  useEffect(() => {
    if (lastState) return;

    (async () => {
      await waitForStorybookReady(view);

      const allStories = prepareSnapshots({ view, splitByMode: true });

      RunnerBridge.log('snapshots prepared', { snapshotsCount: allStories.length });

      await startNewTestingSession(allStories);
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

async function startNewTestingSession(allStories: Snapshot[]): Promise<void> {
  const inspectorData = await SherloModule.getInspectorData().catch((error) => {
    // Extract debug info from the native error
    const errorDetails = {
      message: error.message,
      // The native error details are typically in the userInfo property
      debugInfo: error.userInfo?.debugInfo || {},
    };

    RunnerBridge.log('error getting inspector data', {
      error: errorDetails.message,
      debugInfo: errorDetails.debugInfo,
    });

    throw error;
  });

  if (!inspectorData.includes(VERIFICATION_TEST_ID)) {
    RunnerBridge.log('Main view ID not found on screen');

    // Using setTimeout to throw outside React's event loop - this ensures the error crashes the app instead of being caught by error boundaries
    setTimeout(() => {
      throw new Error('Main view ID not found on screen');
    }, 0);
  }

  RunnerBridge.log('isStorybook7', {
    isStorybook7,
  });

  await RunnerBridge.send({
    action: 'START',
    snapshots: allStories,
  });
}
