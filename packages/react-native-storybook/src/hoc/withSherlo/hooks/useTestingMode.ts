import { useEffect, useState } from 'react';
import { RunnerBridge } from '../../../runnerBridge';
import { Snapshot } from '../../../types';
import { prepareSnapshots } from '../utils';
import { start } from '@storybook/react-native';
import { SherloMode } from '../withSherlo';

function useTestingMode(
  view: ReturnType<typeof start>,
  mode: SherloMode,
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

    const checkForTestingStories = () => {
      if (mode === 'testing' && Object.keys(view._idToPrepared).length > 0) {
        clearInterval(inter);
        setStoriesSet(true);

        bridge.getConfig().then(async (config) => {
          const { exclude, include } = config;

          bridge.log('config parsing succeeded', {
            exclude,
            include,
          });

          const snapshots = prepareSnapshots({
            view,
            include,
            exclude,
            splitByMode: true,
          });

          bridge.log('snapshots prepared', {
            snapshotsCount: snapshots.length,
          });

          let initialSelectionIndex: number | undefined;
          let state;

          try {
            state = await bridge.getState();
            initialSelectionIndex = state.snapshotIndex;

            bridge.log('existing state', {
              state,
            });
          } catch (error) {
            // no state found
          }

          if (initialSelectionIndex === undefined) {
            await bridge.create();

            const startResponse = await bridge.send({
              action: 'START',
              snapshots,
            });

            initialSelectionIndex = startResponse.nextSnapshotIndex;
          }

          setTestedIndex(initialSelectionIndex);
          setSnapshots(snapshots);
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, Object.keys(view._idToPrepared).length]);
}

export default useTestingMode;
