import { useEffect } from 'react';
import { RunnerBridge } from '../../../../helpers';
import SherloModule from '../../../../SherloModule';
import prepareSnapshots from './prepareSnapshots';
import { StorybookView } from '../../../../types';
import { enumerateStories } from '../../../../storybook/adapter';

export function filterStoryMetas<T extends { id: string }>(
  storyMetas: T[],
  includeStoryIds: string[] | undefined
): T[] {
  if (!Array.isArray(includeStoryIds)) return storyMetas;
  return storyMetas.filter((m) => includeStoryIds.includes(m.id));
}

function useSetInitialTestingData({ view }: { view: StorybookView }): void {
  const lastState = SherloModule.getLastState();

  useEffect(() => {
    if (lastState) return;

    (async () => {
      const storyMetas = enumerateStories(view);
      const config = SherloModule.getConfig();
      const filteredStoryMetas = filterStoryMetas(
        storyMetas,
        config.discoveryFilter?.includeStoryIds
      );
      const allStories = prepareSnapshots({ storyMetas: filteredStoryMetas, splitByMode: true });

      RunnerBridge.log('start testing session', {
        storiesCount: allStories.length,
      });

      await RunnerBridge.send({
        action: 'START',
        snapshots: allStories,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useSetInitialTestingData;
