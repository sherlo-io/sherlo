import { StorybookView } from '../../../../types';
import { MetadataProviderRef } from '../MetadataProvider';
import useSetInitialTestingData from './useSetInitialTestingData';
import useTestStory from './useTestStory';

function useTestAllStories({
  view,
  metadataProviderRef,
}: {
  view: StorybookView;
  metadataProviderRef: React.RefObject<MetadataProviderRef>;
}) {
  useSetInitialTestingData({
    view,
  });

  useTestStory({
    metadataProviderRef,
  });
}

export default useTestAllStories;
