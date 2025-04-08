import { StorybookView } from '../../../../types';
import { MetadataCollectorRef } from '../MetadataCollector';
import useSetInitialTestingData from './useSetInitialTestingData';
import useTestStory from './useTestStory';

function useTestAllStories({
  view,
  metadataCollectorRef,
}: {
  view: StorybookView;
  metadataCollectorRef: React.RefObject<MetadataCollectorRef>;
}) {
  useSetInitialTestingData({
    view,
  });

  useTestStory(metadataCollectorRef);
}

export default useTestAllStories;
