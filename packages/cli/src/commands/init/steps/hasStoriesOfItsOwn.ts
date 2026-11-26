/**
 * DOES THE APP HAVE STORIES OF ITS OWN? A story file anywhere in the project except `.rnstorybook`,
 * where Storybook keeps its example stories, and the folders no one writes in. Decides whether
 * setup can start the first test (the app's stories) or must first send the person to write them
 * (only Storybook's examples exist).
 */
import someAppFile from './someAppFile';

const STORY_FILE = /\.stories\.(?:[cm]?[jt]sx?)$/;

function hasStoriesOfItsOwn(): boolean {
  return someAppFile((filePath) => STORY_FILE.test(filePath));
}

export default hasStoriesOfItsOwn;
