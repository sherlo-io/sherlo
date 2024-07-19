import { start } from '@storybook/react-native';
import { useEffect, useState } from 'react';
import { AckStartProtocolItem, RunnerBridge } from '../../helpers/runnerBridge';
import { Snapshot, StorybookViewMode } from '../../types';
import { prepareSnapshots } from '../utils';

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
        let filteredSnapshots: Snapshot[] | undefined;
        let state;

        try {
          state = await bridge.getState();
          initialSelectionIndex = state.snapshotIndex;
          filteredSnapshots = state.filteredSnapshots;

          bridge.log('existing state', {
            state,
          });
        } catch (error) {
          // no state found
        }

        if (initialSelectionIndex === undefined || filteredSnapshots === undefined) {
          await bridge.create();

          const startResponse = (await bridge.send({
            action: 'START',
            snapshots,
          })) as AckStartProtocolItem;

          initialSelectionIndex = startResponse.nextSnapshotIndex;
          filteredSnapshots = startResponse.filteredSnapshots;
        }

        setTestedIndex(initialSelectionIndex);
        setSnapshots(filteredSnapshots);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, Object.keys(view._idToPrepared).length]);
}

export default useTestingMode;
