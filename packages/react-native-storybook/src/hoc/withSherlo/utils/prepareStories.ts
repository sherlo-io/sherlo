import picomatch from 'picomatch-browser';
import { Platform } from 'react-native';
import { constants } from '../../../data';
import { Story, StorybookView } from '../../../types';
interface PrepareStoriesInput {
  view: StorybookView;
  dontFilter?: boolean;
  exclude?: string | string[];
  include?: string | string[];
  splitByMode?: boolean;
}

const prepareStories = ({
  view,
  dontFilter,
  exclude,
  include,
  splitByMode,
}: PrepareStoriesInput): Story[] => {
  let storiesWithModes: any[] = [];

  Object.values(view._idToPrepared).forEach((rawStory) => {
    if (rawStory.parameters.sherlo?.mode && splitByMode) {
      let modesArray = rawStory.parameters.sherlo?.mode;
      if (!Array.isArray(modesArray)) {
        modesArray = [modesArray];
      }

      modesArray.forEach((mode: string) => {
        if (mode === constants.modes.DEFAULT_MODE || mode === constants.modes.FULL_HEIGHT_MODE) {
          storiesWithModes.push({ ...rawStory, mode });
        }
      });
    } else {
      storiesWithModes.push({
        ...rawStory,
        mode: constants.modes.DEFAULT_MODE,
      });
    }
  });

  if (!dontFilter) {
    storiesWithModes = storiesWithModes.filter(({ parameters, title }) => {
      const picomatchOptions = { contains: true, nocase: true };
      const isMatchConfigInclude = picomatch.isMatch(title, include ?? '*', picomatchOptions);
      const isMatchConfigExclude = exclude
        ? picomatch.isMatch(title, exclude, picomatchOptions)
        : false;

      if (!isMatchConfigInclude || isMatchConfigExclude) {
        return false;
      }

      if (parameters.sherlo) {
        const { sherlo } = parameters;

        const isNotExcluded = !sherlo.exclude;
        const isMatchPlatformOS = !sherlo.platform || sherlo.platform === Platform.OS;

        return isNotExcluded && isMatchPlatformOS;
      }

      return true;
    });
  }

  // TODO: dodac komentarze dla reverse + id?
  storiesWithModes = storiesWithModes
    .map(({ hooks, ...value }) => ({
      ...value,
      storyId: value.id,
      id: `${value.id}-${value.mode}`,
      displayName: `${value.title} - ${value.name}`,
    }))
    .reverse();

  return storiesWithModes;
};

export default prepareStories;
