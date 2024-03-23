import { useEffect, useState } from 'react';
import { RunnerBridge } from '../../../runnerBridge';
import { Story } from '../../../types';
import { prepareStories } from '../utils';
import { start } from '@storybook/react-native';
import { Mode } from '../../withStorybook/ModeProvider';

function useTestingMode(
  view: ReturnType<typeof start>,
  mode: Mode,
  setStories: (stories: Story[]) => void,
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
          const { exclude, include, initSnapshotIndex } = config;

          const filteredStories = prepareStories({
            view,
            include,
            exclude,
            splitByMode: true,
          });

          bridge.log('config parsing succeeded', {
            storiesCount: filteredStories.length,
            initSnapshotIndex,
            filteredStories,
          });

          let initialSelectionIndex = initSnapshotIndex || 0;
          let isFreshStart = true;
          let state;
          try {
            state = await bridge.getState();
            initialSelectionIndex = state.index + (state.retry ? 0 : 1);
            isFreshStart = false;
          } catch (error) {
            //
          }

          bridge.log('checked for existing state', {
            state,
            willEnd: initialSelectionIndex >= filteredStories.length,
            isFreshStart,
            initialSelectionIndex,
          });

          // there is no next snapshot
          // this can happen if previous snapshot had errors, was screenshot by master script
          // and we reboot to screenshot next snapshot
          if (initialSelectionIndex >= filteredStories.length) {
            await bridge.send({ action: 'END' });
          } else {
            const story = filteredStories[initialSelectionIndex];

            if (isFreshStart) {
              await bridge.create();
              await bridge.send({
                action: 'START',
                stories: JSON.stringify(filteredStories),
              });
            }

            await bridge.updateState({
              index: initialSelectionIndex,
              storyId: story.id,
              storyDisplayName: story.displayName,
              launchTimestamp: Date.now(),
              timestamp: Date.now(),
              retry: state?.retry,
            });

            setTestedIndex(initialSelectionIndex);
            setStories(filteredStories);
          }
        });
      }
    };
  }, [mode, Object.keys(view._idToPrepared).length]);
}

export default useTestingMode;
