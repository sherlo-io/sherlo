import { useEffect } from 'react';
import { RunnerBridge } from '../../../runnerBridge';
import { Story } from '../../../types';
import { Mode } from '../withSherlo';
import useSherloEffectExecutionEffect from './useSherloEffectExecutionEffect';

const PREVIEW_TIMEOUT = 5 * 1000;

function usePreviewMode(
  bridge: RunnerBridge,
  renderedStoryId: string | undefined,
  testedIndex: number | undefined,
  stories: Story[] | undefined,
  setMode: (m: Mode) => void,
  emitStory: (id: string) => void,
  prepareStory: (story: any) => Promise<boolean>,
  sherloEffectExecution: ReturnType<typeof useSherloEffectExecutionEffect>,
  mode?: Mode
): void {
  const getStoryById = (id: string): Story | undefined => {
    return stories?.find((story) => story.storyId === id);
  };

  useEffect(() => {
    if (mode === 'preview' && renderedStoryId) {
      bridge.log('usePreviewMode', {
        renderedStoryId,
      });

      const handlePreview = async (): Promise<void> => {
        const story = getStoryById(renderedStoryId);

        await prepareStory(story);

        setTimeout(() => {
          bridge.log('turning off preview', { renderedStoryId });

          setMode('original');
          emitStory(renderedStoryId);
        }, PREVIEW_TIMEOUT);
      };

      emitStory(renderedStoryId);
      sherloEffectExecution.clear();
      handlePreview();
    }
  }, [mode, renderedStoryId, testedIndex]);
}

export default usePreviewMode;
