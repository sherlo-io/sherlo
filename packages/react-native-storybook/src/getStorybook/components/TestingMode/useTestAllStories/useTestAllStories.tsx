import { Theme } from '@storybook/react-native-theming';
import { useState } from 'react';
import { Snapshot, StorybookView } from '../../../../types';
import useRenderStory from './useRenderStory';
import useSetInitialTestingData from './useSetInitialTestingData';
import useTestRenderedStoryAndSetNextOneToRender from './useTestRenderedStoryAndSetNextOneToRender';

function useTestAllStories({
  defaultTheme,
  setUiSettings,
  view,
}: {
  defaultTheme: Theme;
  setUiSettings: React.Dispatch<
    React.SetStateAction<{
      appliedTheme: Theme;
      shouldAddSafeArea: boolean;
    }>
  >;
  view: StorybookView;
}) {
  const [storiesToTest, setStoriesToTest] = useState<Snapshot[]>();
  const [storyToTestData, setStoryToTestData] = useState<{
    requestId: string;
    storyIndex: number;
  }>();
  const [renderedStoryId, setRenderedStoryId] = useState<string>();

  useSetInitialTestingData({
    setStoriesToTest,
    setStoryToTestData,
    view,
  });

  useRenderStory({
    defaultTheme,
    setRenderedStoryId,
    setUiSettings,
    storiesToTest,
    storyToTestData,
    renderedStoryId,
  });

  useTestRenderedStoryAndSetNextOneToRender({
    setStoryToTestData,
    storiesToTest,
    storyToTestData,
    renderedStoryId,
  });
}

export default useTestAllStories;
