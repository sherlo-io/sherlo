import { useEffect } from 'react';
import { getAddons, SET_CURRENT_STORY } from '../utils/storybookImports';

function useStoryEmitter(updateRenderedStoryId: (storyId: string) => void): (id: string) => void {
  useEffect(() => {
    const handleStoryRendered = (...args: any[]): void => {
      const storyId = args?.[0]?.storyId;
      updateRenderedStoryId(storyId);
    };

    const initialize = async (): Promise<void> => {
      const _channel = await getAddons().ready();
      _channel.on(SET_CURRENT_STORY, handleStoryRendered);
    };

    setTimeout(() => initialize(), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return async (storyId: string) => {
    const _channel = await getAddons().ready();
    _channel.emit(SET_CURRENT_STORY, { storyId });
    // if we don't call it twice going back from preview to original mode doesn't work
    _channel.emit(SET_CURRENT_STORY, { storyId });
  };
}

export default useStoryEmitter;
