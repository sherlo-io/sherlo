import { SherloModule } from './helpers';

function openStorybook(): Promise<void> {
  return SherloModule.openStorybook().catch((error) => {
    if (error.code === 'NOT_REGISTERED') {
      console.log(
        'To use `openStorybook()`, you need to first call `registerStorybook()`.\n\nLearn more: https://docs.sherlo.io/getting-started/setup?storybook-entry-point=integrated#storybook-entry-point'
      );
    } else {
      throw error;
    }
  });
}

export default openStorybook;
