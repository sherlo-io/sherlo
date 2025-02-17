import { start } from '@storybook/react-native';
import { useEffect, useState } from 'react';
import { AckStartProtocolItem, RunnerBridge } from '../../helpers/RunnerBridge';
import { Snapshot, StorybookViewMode } from '../../types';
import { prepareSnapshots } from '../utils';
import { SherloModule } from '../../helpers';

function useTestingMode(
  view: ReturnType<typeof start>,
  mode: StorybookViewMode,
  setSnapshots: (snapshots: Snapshot[]) => void,
  setTestedIndex: (index: number) => void,
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

        const lastState = await bridge.getLastState();
        bridge.log('last state from protocol', {
          lastState,
        });
        if (lastState) {
          initialSelectionIndex = lastState.nextSnapshotIndex;
          filteredViewIds = lastState.filteredViewIds;
        }

        if (initialSelectionIndex === undefined || filteredViewIds === undefined) {
          await bridge.create();

          const inspectorData = await SherloModule.getInspectorData();

          if (!inspectorData.includes('sherlo-getStorybook-verification')) {
            throw new Error('Main view ID not found on screen');
          }

          const startResponse = (await bridge.send({
            action: 'START',
            snapshots,
          })) as AckStartProtocolItem;

          initialSelectionIndex = startResponse.nextSnapshotIndex;
          filteredViewIds = startResponse.filteredViewIds;
        }

        const filteredSnapshots = snapshots.filter(({ viewId }) =>
          filteredViewIds?.includes(viewId)
        );

        bridge.log('set initial testing state', {
          initialSelectionIndex,
          filteredSnapshots,
        });

        setTestedIndex(initialSelectionIndex);
        setSnapshots(filteredSnapshots);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, Object.keys(view._idToPrepared).length]);
}

export default useTestingMode;
