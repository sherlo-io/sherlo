/**
 * DOES THE APP HAVE STORIES OF ITS OWN? A story file anywhere in the project except `.rnstorybook`,
 * where Storybook keeps its example stories, and the folders no one writes in. Decides whether
 * setup can start the first test (the app's stories) or must first send the person to write them
 * (only Storybook's examples exist).
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';

const STORY_FILE = /\.stories\.(?:[cm]?[jt]sx?)$/;
const SKIPPED_FOLDERS = new Set(['node_modules', '.rnstorybook', '.git', 'ios', 'android']);

function hasStoriesOfItsOwn(folder: string = getCwd()): boolean {
  return fs.readdirSync(folder, { withFileTypes: true }).some((entry) => {
    if (entry.isDirectory()) {
      return !SKIPPED_FOLDERS.has(entry.name) && hasStoriesOfItsOwn(path.join(folder, entry.name));
    }
    return STORY_FILE.test(entry.name);
  });
}

export default hasStoriesOfItsOwn;
