import { useEffect } from 'react';
import {
  getAddons,
  STORY_CHANGED,
} from '../components/TestingMode/useTestAllStories/storybookImports';
import { view } from '../../../../../testing/react-native/.storybook/storybook.requires';

function useStorybookEventListener(): void {
  useEffect(() => {
    const handleStoryRendered = (...args: any[]): void => {
      const storyId = args?.[0]?.storyId;
      console.log('[SHERLO:hook] Story changed:', storyId);
    };

    const initialize = async (): Promise<void> => {
      console.log('[SHERLO:hook] Initializing channel listener');
      const _channel = await getAddons().ready();
      console.log('[SHERLO:hook] Channel ready');
      _channel.on(STORY_CHANGED, handleStoryRendered);
    };

    setTimeout(() => initialize(), 1000);

    global.view._preview.onStoriesChanged({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useStorybookEventListener;
