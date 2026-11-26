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
import storybookFolder, { storybookFile } from './storybookFolder';

const STORY_FILE = /\.stories\.(?:[cm]?[jt]sx?)$/;

/** The app's stories, or the line saying why its main config could not be read. */
export type OwnStories = { found: boolean } | { unreadable: string };

async function hasStoriesOfItsOwn(): Promise<OwnStories> {
  const storybookLoads = await storyFilesStorybookLoads();
  if (typeof storybookLoads === 'string') return { unreadable: storybookLoads };
  return {
    found: someAppFile((filePath) => STORY_FILE.test(filePath) && storybookLoads(filePath)),
  };
}

/**
 * Whether the app's Storybook loads a file: its main config is loaded and its `stories` turned
 * into matchers by `storybook/internal/common`, the code Storybook itself runs, and a file's path
 * from the app folder (`./src/Button.stories.tsx`) is tested against them.
 */
async function storyFilesStorybookLoads(): Promise<((filePath: string) => boolean) | string> {
  const appFolder = getCwd();
  const folder = storybookFolder();
  // No folder, no main config and no list: every story file outside the folders counts.
  if (!folder) return () => true;

  const configDir = path.resolve(appFolder, folder);
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
  } catch (error) {
    // No `storybook` package (as before Storybook 9) is no list setup can read, so every story
    // file outside the Storybook folder counts. Storybook reports a main config's own missing
    // import as its evaluation error, never as this code.
    if (isModuleNotFound(error)) return () => true;
    // A folder with no main config (an `index` alone, as before Storybook's `main`) has no list
    // either: Storybook names that as its own error code.
    if (isMainConfigMissing(error)) return () => true;
    // ANY OTHER FAILURE IS NAMED, NOT GUESSED PAST: counting every story file would start the
    // first test on stories Storybook may never show. Storybook wraps the main config's own error
    // (`data.error`), and its first line is the one that names it.
    const cause = (error as { data?: { error?: unknown } }).data?.error ?? error;
    return `Couldn't load ${storybookFile(folder, 'main')} to see which stories it lists: ${String(cause).split('\n')[0]}`;
  }
}

function isModuleNotFound(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND';
}

/** Storybook's MainFileMissingError, by its public code (its class name is not exported stably). */
function isMainConfigMissing(error: unknown): boolean {
  return (error as { fullErrorCode?: string }).fullErrorCode === 'SB_CORE-SERVER_0006';
}

export default hasStoriesOfItsOwn;
