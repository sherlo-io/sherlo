import { start } from '@storybook/react-native';
import { useEffect, useState } from 'react';
import { AckStartProtocolItem, RunnerBridge } from '../../helpers/RunnerBridge';
import { Snapshot, StorybookViewMode } from '../../types';
import { prepareSnapshots } from '../utils';
import { SherloModule } from '../../helpers';
import { VERIFICATION_TEST_ID } from '../../constants';

function useTestingMode(
  view: ReturnType<typeof start>,
  mode: StorybookViewMode,
  setSnapshots: (snapshots: Snapshot[]) => void,
  setTestedIndex: (index: number) => void,
  setCurrentRequestId: (requestId: string) => void,
  bridge: RunnerBridge
): void {
  const [storiesSet, setStoriesSet] = useState(false);

  useEffect(() => {
    if (storiesSet) return;

    const inter = setInterval(() => {
      checkForTestingStories();
    }, 500);

    const checkForTestingStories = async () => {
      if (mode === 'testing' && Object.keys(view._idToPrepared).length > 0) {
        clearInterval(inter);
        setStoriesSet(true);

        const snapshots = prepareSnapshots({
          view,
          splitByMode: true,
        });

        bridge.log('snapshots prepared', {
          snapshotsCount: snapshots.length,
        });

        let initialSelectionIndex: number | undefined;
        let filteredViewIds: String[] | undefined;
        let currentRequestId: string | undefined;
        const lastState = await bridge.getLastState();
        bridge.log('last state from protocol', {
          lastState,
        });
        if (lastState) {
          currentRequestId = lastState.requestId;
          initialSelectionIndex = lastState.nextSnapshotIndex;
          filteredViewIds = lastState.filteredViewIds;
        }

        // TODO: check if can be an else case
        if (
          initialSelectionIndex === undefined ||
          filteredViewIds === undefined ||
          currentRequestId === undefined
        ) {
          await bridge.create();

          const inspectorData = await SherloModule.getInspectorData().catch((error) => {
            // Extract debug info from the native error
            const errorDetails = {
              message: error.message,
              // The native error details are typically in the userInfo property
              debugInfo: error.userInfo?.debugInfo || {},
            };

            bridge.log('error getting inspector data', {
              error: errorDetails.message,
              debugInfo: errorDetails.debugInfo,
            });
            throw error;
          });

          if (!inspectorData.includes(VERIFICATION_TEST_ID)) {
            bridge.log('Main view ID not found on screen');
            throw new Error('Main view ID not found on screen');
          }

          const startResponse = (await bridge.send({
            action: 'START',
            snapshots,
          })) as AckStartProtocolItem;

          currentRequestId = startResponse.requestId;
          initialSelectionIndex = startResponse.nextSnapshotIndex;
          filteredViewIds = startResponse.filteredViewIds;
        }

        // TODO: check why there would be no viewId
        const filteredSnapshots = snapshots.filter(({ viewId }) =>
          filteredViewIds?.includes(viewId)
        );

        bridge.log('set initial testing state', {
          initialSelectionIndex,
          filteredSnapshots,
        });

        setCurrentRequestId(currentRequestId);
        setTestedIndex(initialSelectionIndex);
        setSnapshots(filteredSnapshots);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, Object.keys(view._idToPrepared).length]);
}

export default useTestingMode;
