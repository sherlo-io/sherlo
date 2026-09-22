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
      // This effect starts the protocol-file handshake with a real runner (RunnerBridge.send
      // below writes to the device), so it needs a real run's config to mean anything. A capture
      // restarts into testing mode with no config on disk and no runner behind it (see
      // captureTransport.ts) - that is nothing to start, not an error, and the capture must still
      // read and write nothing in storage, so this skips rather than falls back to a default.
      let config: ReturnType<typeof SherloModule.getConfig>;
      try {
        config = SherloModule.getConfig();
      } catch (_e) {
        return;
      }

      const storyMetas = enumerateStories(view);
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
