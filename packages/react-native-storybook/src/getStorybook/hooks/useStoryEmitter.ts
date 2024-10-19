import { SET_CURRENT_STORY } from '@storybook/core/core-events';
import { addons } from '@storybook/core/manager-api';
import { useEffect } from 'react';

function useStoryEmitter(updateRenderedStoryId: (storyId: string) => void): (id: string) => void {
  useEffect(() => {
    const handleStoryRendered = (...args: any[]): void => {
      const storyId = args?.[0]?.storyId;
      updateRenderedStoryId(storyId);
    };

    const initialize = (): Promise<void> =>
      addons.ready().then((_channel) => {
        _channel.on(SET_CURRENT_STORY, handleStoryRendered);
      });

    setTimeout(() => initialize(), 500);
  }, []);

  return (storyId: string) => {
    addons.ready().then((_channel) => {
      _channel.emit(SET_CURRENT_STORY, { storyId });
      // if we don't call it twice going back from preview to original mode doesn't work
      _channel.emit(SET_CURRENT_STORY, { storyId });
    });
  };
}

export default useStoryEmitter;
