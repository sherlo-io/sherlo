import { Theme } from '@storybook/react-native-theming';
import deepmerge from 'deepmerge';
import { useEffect } from 'react';
import { RunnerBridge } from '../../../../helpers';
import { Snapshot } from '../../../../types';
import useStoryEmitter from './useStoryEmitter';

function useRenderStory({
  defaultTheme,
  setRenderedStoryId,
  setUiSettings,
  storiesToTest,
  storyToTestData,
  renderedStoryId,
}: {
  defaultTheme: Theme;
  setRenderedStoryId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setUiSettings: React.Dispatch<
    React.SetStateAction<{
      theme: Theme;
      shouldAddSafeArea: boolean;
    }>
  >;
  storiesToTest: Snapshot[] | undefined;
  storyToTestData:
    | {
        requestId: string;
        storyIndex: number;
      }
    | undefined;
  renderedStoryId: string | undefined;
}): void {
  const renderStory = useStoryEmitter({
    updateRenderedStoryId: (storyId) => {
      RunnerBridge.log('rendered story', { id: storyId });

      setRenderedStoryId(storyId);
    },
  });

  const storyIndexToTest = storyToTestData?.storyIndex;

  useEffect(() => {
    if (!storiesToTest || !storiesToTest.length || storyIndexToTest === undefined) return;

    const storyToTest = storiesToTest[storyIndexToTest];

    const isAlreadyRendered = storyToTest.storyId === renderedStoryId;

    if (isAlreadyRendered) return;

    RunnerBridge.log('emitting story', {
      storyId: storyToTest.storyId,
      testedIndex: storyIndexToTest,
    });

    setUiSettings({
      theme: deepmerge(defaultTheme, storyToTest.parameters?.theme ?? {}),
      shouldAddSafeArea: !storyToTest.parameters?.noSafeArea,
    });

    renderStory(storyToTest);
  }, [storyIndexToTest]);
}

export default useRenderStory;
