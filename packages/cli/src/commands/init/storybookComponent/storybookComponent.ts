import { printTitle } from '../helpers';
import updateStorybookComponent from './updateStorybookComponent';

async function storybookComponent(
  sessionId: string | null
): Promise<{ hasUpdatedStorybookComponent: boolean }> {
  printTitle('📕 Storybook Component');

  console.log('To enable Sherlo to navigate through stories, Storybook component must be updated');

  console.log();

  const { hasUpdatedStorybookComponent } = await updateStorybookComponent(sessionId);

  return { hasUpdatedStorybookComponent };
}

export default storybookComponent;
