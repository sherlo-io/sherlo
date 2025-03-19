import { Snapshot, SnapshotMode, StorybookView } from '../../../../types';

function prepareSnapshots({
  view,
  splitByMode,
}: {
  view: StorybookView;
  splitByMode?: boolean;
}): Snapshot[] {
  let snapshots: Snapshot[] = [];

  Object.values(view._idToPrepared).forEach((rawStory) => {
    let modesArray: SnapshotMode[] = [modes.DEFAULT_MODE];

    if (rawStory.parameters.sherlo?.mode && splitByMode) {
      const mode: SnapshotMode = rawStory.parameters.sherlo?.mode;

      if (mode === modes.DEFAULT_MODE || mode === modes.FULL_HEIGHT_MODE) {
        modesArray = Array.isArray(mode) ? mode : [mode];
      }
    }

    modesArray.forEach((mode: string) => {
      if (mode === modes.DEFAULT_MODE || mode === modes.FULL_HEIGHT_MODE) {
        let sherloParameters = rawStory.parameters.sherlo || {};

        if (rawStory.parameters?.design?.url) {
          sherloParameters = { figmaUrl: rawStory.parameters.design.url, ...sherloParameters };
        }

        snapshots.push({
          viewId: `${rawStory.id}-${mode}`,
          mode: modes.DEFAULT_MODE,
          displayName: `${rawStory.title} - ${rawStory.name}`,
          sherloParameters,

          componentId: rawStory.componentId,
          componentTitle: rawStory.title,
          storyId: rawStory.id,
          storyTitle: rawStory.name,

          parameters: rawStory.parameters,
          argTypes: rawStory.argTypes,
          args: rawStory.initialArgs,
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
