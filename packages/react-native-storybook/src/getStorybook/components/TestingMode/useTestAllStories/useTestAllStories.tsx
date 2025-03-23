import { StorybookView } from '../../../../types';
import useSetInitialTestingData from './useSetInitialTestingData';
import useTestStory from './useTestStory';

function useTestAllStories({ view }: { view: StorybookView }) {
  useSetInitialTestingData({
    view,
  });

  useTestStory();
}

export default useTestAllStories;
