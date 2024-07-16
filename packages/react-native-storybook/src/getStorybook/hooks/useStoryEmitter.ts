import { SET_CURRENT_STORY } from '@storybook/core-events';
import { addons } from '@storybook/manager-api';
import { useEffect } from 'react';

function useStoryEmitter(updateRenderedStoryId: (storyId: string) => void): (id: string) => void {
  useEffect(() => {
    function handleStoryRendered(...args: any[]): void {
      const storyId = args?.[0]?.storyId;
      updateRenderedStoryId(storyId);
    }

    function initialize(): Promise<void> {
      return addons.ready().then((_channel) => {
        _channel.on(SET_CURRENT_STORY, handleStoryRendered);
      });
    }

    setTimeout(() => initialize(), 500);
  }, [updateRenderedStoryId]);

  return function (storyId: string) {
    addons.ready().then((_channel) => {
      _channel.emit(SET_CURRENT_STORY, { storyId });
      // if we don't call it twice going back from preview to original mode doesn't work
      _channel.emit(SET_CURRENT_STORY, { storyId });
    });
  };
}

export default useStoryEmitter;
