import { StorybookView } from '../../../../types';
import { ViewInspectorRef } from '../ViewInspector';
import useSetInitialTestingData from './useSetInitialTestingData';
import useTestStory from './useTestStory';

function useTestAllStories({
  view,
  viewInspectorRef,
}: {
  view: StorybookView;
  viewInspectorRef: ViewInspectorRef;
}) {
  useSetInitialTestingData({
    view,
  });

  useTestStory(viewInspectorRef);
}

export default useTestAllStories;
