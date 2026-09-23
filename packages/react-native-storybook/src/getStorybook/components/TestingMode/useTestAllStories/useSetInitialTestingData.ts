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

function useSetInitialTestingData({
  view,
  enabled = true,
}: {
  view: StorybookView;
  /**
   * Whether this boot may start the protocol-file handshake at all - false for a capture, which
   * has no runner behind it to answer this (see useTestAllStories, the one place that reads
   * SherloModule.getDriver() to decide). Defaults to true so a caller that never drives a capture
   * (every test in this file included) does not have to pass it.
   */
  enabled?: boolean;
}): void {
  const lastState = SherloModule.getLastState();

  useEffect(() => {
    // A story already queued means some earlier step of this same session already started the
    // handshake below - nothing left here to start. `enabled` is the other half: whether this
    // boot may start it at all (see the param doc above).
    if (!enabled || lastState) return;

    (async () => {
      // Every testing-mode boot now carries a real config - a run's own config.sherlo, or the SDK
      // defaults a capture hands across its restart (see SherloModuleCore on each platform) - so
      // there is nothing left here to fall back from.
      const config = SherloModule.getConfig();

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
