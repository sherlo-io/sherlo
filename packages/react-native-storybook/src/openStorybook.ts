import { SherloModule } from './helpers';

function openStorybook(): Promise<void> {
  return SherloModule.openStorybook().catch((error) => {
    // TODO: fix error.hasNoRegister
    if (error.hasNoRegister) {
      throw new Error(
        'To use `openStorybook()`, you need to first call `registerStorybook()`.\n\nLearn more: https://docs.sherlo.io/getting-started/setup?storybook-entry-point=integrated#storybook-entry-point'
      );
    } else {
      throw error;
    }
  });
}

export default openStorybook;
