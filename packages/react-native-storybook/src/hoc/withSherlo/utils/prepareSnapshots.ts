import { constants } from '../../../data';
import { Snapshot, StorybookView } from '../../../types';
import { SnapshotMode } from '../../../data/constants';
interface prepareSnapshotsInput {
  view: StorybookView;
  dontFilter?: boolean;
  splitByMode?: boolean;
}

const prepareSnapshots = ({ view, splitByMode }: prepareSnapshotsInput): Snapshot[] => {
  let snapshots: Snapshot[] = [];

  Object.values(view._idToPrepared).forEach((rawStory) => {
    let modesArray: SnapshotMode[] = [constants.modes.DEFAULT_MODE];

    if (rawStory.parameters.sherlo?.mode && splitByMode) {
      const mode: SnapshotMode = rawStory.parameters.sherlo?.mode;

      if (mode === constants.modes.DEFAULT_MODE || mode === constants.modes.FULL_HEIGHT_MODE) {
        modesArray = Array.isArray(mode) ? mode : [mode];
      }
    }

    modesArray.forEach((mode: string) => {
      if (mode === constants.modes.DEFAULT_MODE || mode === constants.modes.FULL_HEIGHT_MODE) {
        let sherloParameters = rawStory.parameters.sherlo || {};

        if (rawStory.parameters?.design?.url) {
          sherloParameters = { figmaUrl: rawStory.parameters.design.url, ...sherloParameters };
        }

        snapshots.push({
          viewId: `${rawStory.id}-${mode}`,
          mode: constants.modes.DEFAULT_MODE,
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
};

export default prepareSnapshots;
