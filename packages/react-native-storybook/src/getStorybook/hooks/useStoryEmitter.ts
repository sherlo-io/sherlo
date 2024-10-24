import { useEffect } from 'react';
import { getAddons, SET_CURRENT_STORY } from '../utils/storybookImports';
import { Snapshot } from '../../types';

function useStoryEmitter({
  updateRenderedStoryId,
}: {
  updateRenderedStoryId: (snapshot: Snapshot) => void;
}): (snapshot: Snapshot) => void {
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

  return async (snapshot: Snapshot) => {
    const _channel = await getAddons().ready();
    _channel.emit(SET_CURRENT_STORY, { storyId: snapshot.storyId });
    // if we don't call it twice going back from preview to original mode doesn't work
    _channel.emit(SET_CURRENT_STORY, { storyId: snapshot.storyId });
  };
}

export default useStoryEmitter;
