/**
 * DOES THE APP HAVE STORIES OF ITS OWN? A story file anywhere in the project except the app's
 * Storybook folder (./storybookFolder), where Storybook keeps its example stories, and the folders
 * no one writes in, that the app's Storybook loads: its main config's `stories` list it, read by
 * Storybook's own loader. A story file the list leaves out never shows in Storybook, so it is not
 * a story the first test can capture. Decides whether setup can start the first test (the app's
 * stories) or must first send the person to write them (only Storybook's examples exist).
 */
import path from 'path';
import { getCwd } from '../../../helpers';
import { workstation } from '../../../seams/workstation';
import someAppFile from './someAppFile';
import storybookFolder from './storybookFolder';

const STORY_FILE = /\.stories\.(?:[cm]?[jt]sx?)$/;

async function hasStoriesOfItsOwn(): Promise<boolean> {
  const storybookLoads = await storyFilesStorybookLoads();
  return someAppFile((filePath) => STORY_FILE.test(filePath) && storybookLoads(filePath));
}

/**
 * Whether the app's Storybook loads a file: its main config is loaded and its `stories` turned
 * into matchers by `storybook/internal/common`, the code Storybook itself runs, and a file's path
 * from the app folder (`./src/Button.stories.tsx`) is tested against them.
 */
async function storyFilesStorybookLoads(): Promise<(filePath: string) => boolean> {
  const appFolder = getCwd();
  const configDir = path.resolve(appFolder, storybookFolder() ?? '.');
  try {
    const storybook = workstation().storybookLoader(appFolder);
    const main = await storybook.loadMainConfig({ configDir, cwd: appFolder });
    const entries = storybook.normalizeStories(main.stories ?? [], {
      configDir,
      workingDir: appFolder,
    });
    return (filePath) => {
      const importPath = `./${path.relative(appFolder, filePath).split(path.sep).join('/')}`;
      return entries.some((entry) => entry.importPathMatcher.test(importPath));
    };
  } catch {
    // An app whose Storybook cannot be loaded here (no `storybook` package, as before Storybook
    // 9, or a main config that needs what only Metro gives it) has no list setup can read, so
    // every story file outside the Storybook folder counts.
    return () => true;
  }
}

export default hasStoriesOfItsOwn;
