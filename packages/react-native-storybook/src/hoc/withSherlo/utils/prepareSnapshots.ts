import picomatch from 'picomatch-browser';
import { Platform } from 'react-native';
import { constants } from '../../../data';
import { Snapshot, StorybookView } from '../../../types';
import { SnapshotMode } from '../../../data/constants';
interface prepareSnapshotsInput {
  view: StorybookView;
  dontFilter?: boolean;
  exclude?: string | string[];
  include?: string | string[];
  splitByMode?: boolean;
}

const prepareSnapshots = ({
  view,
  dontFilter,
  exclude,
  include,
  splitByMode,
}: prepareSnapshotsInput): Snapshot[] => {
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

  if (!dontFilter) {
    snapshots = snapshots.filter(({ parameters }) => {
      // const picomatchOptions = { contains: true, nocase: true };
      // const isMatchConfigInclude = picomatch.isMatch(displayName, include ?? '*', picomatchOptions);
      // const isMatchConfigExclude = exclude
      //   ? picomatch.isMatch(displayName, exclude, picomatchOptions)
      //   : false;

      // if (!isMatchConfigInclude || isMatchConfigExclude) {
      //   return false;
      // }

      if (parameters.sherlo) {
        const { sherlo } = parameters;

        const isNotExcluded = !sherlo.exclude;
        const isMatchPlatformOS = !sherlo.platform || sherlo.platform === Platform.OS;

        return isNotExcluded && isMatchPlatformOS;
      }

      return true;
    });
  }

  return snapshots.reverse();
};

export default prepareSnapshots;
