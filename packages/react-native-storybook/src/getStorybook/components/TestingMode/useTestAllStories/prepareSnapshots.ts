import { Snapshot, SnapshotMode, StoryId } from '../../../../types';
import { StoryMeta } from '../../../../storybook/adapter';

function prepareSnapshots({
  storyMetas,
  splitByMode,
}: {
  storyMetas: StoryMeta[];
  splitByMode?: boolean;
}): Snapshot[] {
  let snapshots: Snapshot[] = [];

  storyMetas.forEach((storyMeta) => {
    const parameters = storyMeta.parameters ?? {};
    let modesArray: SnapshotMode[] = [modes.DEFAULT_MODE];

    if (parameters.sherlo?.mode && splitByMode) {
      const mode: SnapshotMode = parameters.sherlo?.mode;

      if (mode === modes.DEFAULT_MODE || mode === modes.FULL_HEIGHT_MODE) {
        modesArray = Array.isArray(mode) ? mode : [mode];
      }
    }

    modesArray.forEach((mode: string) => {
      if (mode === modes.DEFAULT_MODE || mode === modes.FULL_HEIGHT_MODE) {
        let sherloParameters = parameters.sherlo || {};

        if (parameters.design?.url) {
          sherloParameters = { figmaUrl: parameters.design.url, ...sherloParameters };
        }

        snapshots.push({
          viewId: storyMeta.id + '-' + mode,
          mode: modes.DEFAULT_MODE,
          displayName: storyMeta.title + ' - ' + storyMeta.name,
          sherloParameters,

          componentId: storyMeta.id,
          componentTitle: storyMeta.title,
          storyId: storyMeta.id as StoryId,
          storyTitle: storyMeta.name,

          parameters,
          argTypes: {},
          args: {},
        });
      }
    });
  });

  return snapshots.reverse();
}

export default prepareSnapshots;

/* ========================================================================== */

const modes: { DEFAULT_MODE: SnapshotMode; FULL_HEIGHT_MODE: SnapshotMode } = {
  DEFAULT_MODE: 'deviceHeight',
  FULL_HEIGHT_MODE: 'fullHeight',
};
