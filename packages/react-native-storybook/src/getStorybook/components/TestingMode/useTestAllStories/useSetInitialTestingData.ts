import { start } from '@storybook/react-native';
import { useEffect, useState } from 'react';
import { VERIFICATION_TEST_ID } from '../../../../constants';
import { SherloModule, RunnerBridge } from '../../../../helpers';
import { Snapshot } from '../../../../types';
import prepareSnapshots from './prepareSnapshots';

function useSetInitialTestingData({ view }: { view: ReturnType<typeof start> }): void {
  const lastState = SherloModule.getLastState();

  const isStorybookReady = useIsStorybookReady(view);

  useEffect(() => {
    if (!isStorybookReady || lastState) return;

    (async () => {
      const allStories = prepareSnapshots({ view, splitByMode: true });

      RunnerBridge.log('snapshots prepared', { snapshotsCount: allStories.length });

      await startNewTestingSession(allStories);
    })();
  }, [isStorybookReady]);
}

export default useSetInitialTestingData;

/* ========================================================================== */

function useIsStorybookReady(view: ReturnType<typeof start>): boolean {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkIfReady = () => {
      const isReady = Object.keys(view._idToPrepared).length > 0;

      if (isReady) {
        setIsReady(true);
        return true;
      }

      return false;
    };

    if (checkIfReady()) return;

    const inter = setInterval(() => {
      if (checkIfReady()) clearInterval(inter);
    }, 500);

    return () => clearInterval(inter);
  }, []);

  return isReady;
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

  await RunnerBridge.send({
    action: 'START',
    snapshots: allStories,
  });
}
