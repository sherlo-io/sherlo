import { start } from '@storybook/react-native';
import { useEffect, useState } from 'react';
import { VERIFICATION_TEST_ID } from '../../../../constants';
import { SherloModule, RunnerBridge } from '../../../../helpers';
import { AckStartProtocolItem } from '../../../../helpers/RunnerBridge';
import { Snapshot } from '../../../../types';
import prepareSnapshots from './prepareSnapshots';

function useSetInitialTestingData({
  setStoriesToTest,
  setStoryToTestData,
  view,
}: {
  setStoriesToTest: React.Dispatch<React.SetStateAction<Snapshot[] | undefined>>;
  setStoryToTestData: React.Dispatch<
    React.SetStateAction<
      | {
          requestId: string;
          storyIndex: number;
        }
      | undefined
    >
  >;
  view: ReturnType<typeof start>;
}): void {
  const isStorybookReady = useIsStorybookReady(view);

  useEffect(() => {
    if (!isStorybookReady) return;

    const setTestingData = async () => {
      const allStories = prepareSnapshots({ view, splitByMode: true });

      RunnerBridge.log('snapshots prepared', { snapshotsCount: allStories.length });

      const lastState = await RunnerBridge.getLastState();

      RunnerBridge.log('last state from protocol', { lastState });

      let filteredViewIds: string[] | undefined;
      let nextSnapshotIndex: number | undefined;
      let requestId: string | undefined;

      if (lastState) {
        ({ filteredViewIds, nextSnapshotIndex, requestId } = lastState);
      } else {
        ({ filteredViewIds, nextSnapshotIndex, requestId } = await startNewTestingSession(
          allStories
        ));
      }

      const filteredStories = allStories.filter(({ viewId }) => filteredViewIds?.includes(viewId));

      RunnerBridge.log('set initial testing state', {
        initialSelectionIndex: nextSnapshotIndex,
        filteredSnapshots: filteredStories,
      });

      setStoriesToTest(filteredStories);
      setStoryToTestData({ requestId, storyIndex: nextSnapshotIndex });
    };

    setTestingData();
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

async function startNewTestingSession(allStories: Snapshot[]): Promise<{
  filteredViewIds: string[];
  nextSnapshotIndex: number;
  requestId: string;
}> {
  await RunnerBridge.create();

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

    throw new Error('Main view ID not found on screen');
  }

  const { filteredViewIds, nextSnapshotIndex, requestId } = (await RunnerBridge.send({
    action: 'START',
    snapshots: allStories,
  })) as AckStartProtocolItem;

  return { filteredViewIds, nextSnapshotIndex, requestId };
}
