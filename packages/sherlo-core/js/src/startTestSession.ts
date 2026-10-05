/**
 * A RUN'S FIRST LAUNCH: list every story, keep the ones the run asked for, shape them into the list
 * the runner is sent, and send it with START.
 *
 * The SDK's useSetInitialTestingData hook calls this once, from its effect.
 */
import type { OpaqueStorybookView as StorybookView } from '../../../react-native-storybook/src/sealedCore/seam';
import { theHost } from './host';
import { enumerateStories } from './adapter';
import prepareSnapshots from './prepareSnapshots';

/** The stories whose ids the run asked for, or every story when it asked for none in particular. */
export function filterStoryMetas<T extends { id: string }>(
  storyMetas: T[],
  includeStoryIds: string[] | undefined
): T[] {
  if (!Array.isArray(includeStoryIds)) return storyMetas;
  return storyMetas.filter((m) => includeStoryIds.includes(m.id));
}

export async function startTestSession(view: StorybookView): Promise<void> {
  const { native, runner } = theHost();

  // A story already queued means an earlier launch of this same session already sent START -
  // nothing left here to start.
  if (native.getLastState()) return;

  // Every testing-mode boot carries a real config - a run's own config.sherlo, or the SDK
  // defaults a capture hands across its restart - so there is nothing here to fall back from.
  const config = native.getConfig();

  const storyMetas = enumerateStories(view);
  const filteredStoryMetas = filterStoryMetas(storyMetas, config.discoveryFilter?.includeStoryIds);
  const allStories = prepareSnapshots({
    storyMetas: filteredStoryMetas,
    splitByMode: true,
  });

  runner.log('start testing session', {
    storiesCount: allStories.length,
  });

  await runner.send({
    action: 'START',
    snapshots: allStories,
  });
}
