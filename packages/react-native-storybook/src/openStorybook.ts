import { SherloModule } from './helpers';
import { handleAsyncError } from './utils';

function openStorybook(): void {
  SherloModule.openStorybook().catch((error) => {
    if (error.code === 'NOT_REGISTERED') {
      handleAsyncError(
        new Error(
          'To use `openStorybook()`, you need to first call `registerStorybook()`.\n\nLearn more: https://docs.sherlo.io/getting-started/setup?storybook-entry-point=integrated#storybook-entry-point'
        )
      );
    } else {
      handleAsyncError(error);
    }
  });
}

export default openStorybook;
