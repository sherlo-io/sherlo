import { useEffect, useState } from 'react';
import { RunnerBridge } from '../../../runnerBridge';
import { Snapshot } from '../../../types';
import { prepareSnapshots } from '../utils';
import { start } from '@storybook/react-native';
import { Mode } from '../../withStorybook/ModeProvider';

function useTestingMode(
  view: ReturnType<typeof start>,
  mode: Mode,
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
          const { exclude, include, initSnapshotIndex, executorIndex, executorsCount } = config;

          bridge.log('config parsing succeeded', {
            exclude,
            include,
            initSnapshotIndex,
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

          const initSnapshotIndexForTarget = initSnapshotIndex || 0;
          const snpashotsForTargetCount = snapshots.length - (initSnapshotIndexForTarget + 1);

          const defaultSnapshotsPerJob = Math.floor(snpashotsForTargetCount / executorsCount);
          const jobsWithUpperBound = snpashotsForTargetCount % executorsCount;

          const snapshotsPerJob = Array.from({ length: executorIndex + 1 }).map(
            (_, index) => defaultSnapshotsPerJob + (index < jobsWithUpperBound ? 1 : 0)
          );

          const jobsSnapshotCount = snapshotsPerJob.reduce(
            (acc, jobSnapshotsCount) => acc + jobSnapshotsCount,
            0
          );
          const finishIndex = initSnapshotIndexForTarget + jobsSnapshotCount - 1;

          const previousJobsSnapshotCount =
            snapshotsPerJob.length > 1
              ? snapshotsPerJob
                  .slice(0, executorIndex)
                  .reduce((acc, jobSnapshotsCount) => acc + jobSnapshotsCount, 0)
              : 0;

          let initialSelectionIndex = initSnapshotIndexForTarget + previousJobsSnapshotCount;

          bridge.log('snapshot indexes calculations', {
            initSnapshotIndexForTarget,
            snpashotsForTargetCount,
            defaultSnapshotsPerJob,
            jobsWithUpperBound,
            snapshotsPerJob,
            jobsSnapshotCount,
            finishIndex,
            previousJobsSnapshotCount,
            initialSelectionIndex,
          });

          let isFreshStart = true;
          let state;
          try {
            state = await bridge.getState();
            initialSelectionIndex = state.snapshotIndex;
            isFreshStart = false;
          } catch (error) {
            // no state found
          }

          bridge.log('checked for existing state', {
            state,
            isFreshStart,
            initialSelectionIndex,
          });

          // there is no next snapshot
          // this can happen if previous snapshot had errors, was screenshot by master script
          // and we reboot to screenshot next snapshot
          if (initialSelectionIndex >= snapshots.length) {
            await bridge.send({ action: 'END' });
          } else {
            if (isFreshStart) {
              await bridge.create();

              await bridge.send({
                action: 'START',
                initialSelectionIndex,
                finishIndex,
                snapshots,
              });
            }

            setTestedIndex(initialSelectionIndex);
            setSnapshots(snapshots);
          }
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, Object.keys(view._idToPrepared).length]);
}

export default useTestingMode;
