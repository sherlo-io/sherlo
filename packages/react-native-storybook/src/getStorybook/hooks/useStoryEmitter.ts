import { useEffect } from 'react';
import { getAddons, getSetCurrentStory } from './adapter';

function useStoryEmitter(updateRenderedStoryId: (storyId: string) => void): (id: string) => void {
  useEffect(() => {
    const handleStoryRendered = (...args: any[]): void => {
      const storyId = args?.[0]?.storyId;
      updateRenderedStoryId(storyId);
    };

    const initialize = async (): Promise<void> => {
      const _channel = await getAddons().ready();
      _channel.on(getSetCurrentStory(), handleStoryRendered);
    };

    setTimeout(() => initialize(), 500);
  }, []);

  return async (storyId: string) => {
    const _channel = await getAddons().ready();
    _channel.emit(getSetCurrentStory(), { storyId });
    // if we don't call it twice going back from preview to original mode doesn't work
    _channel.emit(getSetCurrentStory(), { storyId });
  };
}

export default useStoryEmitter;
