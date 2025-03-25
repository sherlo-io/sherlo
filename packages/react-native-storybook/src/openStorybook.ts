import { SherloModule } from './helpers';

function openStorybook(): Promise<void> {
  return SherloModule.openStorybook();
}

export default openStorybook;
