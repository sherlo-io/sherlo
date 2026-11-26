/**
 * DOES THE APP HAVE STORIES OF ITS OWN? A story file anywhere in the project except the app's
 * Storybook folder (./storybookFolder), where Storybook keeps its example stories, and the folders
 * no one writes in, that the app's Storybook loads: its main config's `stories` list it, read by
 * Storybook's own loader. A story file the list leaves out never shows in Storybook, so it is not
 * a story the first test can capture. Decides whether setup can start the first test (the app's
 * stories) or must first send the person to write them (only Storybook's examples exist).
 *
 * NO CASE COUNTS EVERY STORY FILE: a list setup cannot read is named, never guessed past, as
 * counting every story file would start the first test on stories Storybook may never show. The
 * folder always exists here: setup stops before any change when the app's Storybook has none
 * (../requirements, storybook-no-folder), and every supported Storybook (9.0 and later) has its
 * `storybook` package and a main config.
 */
import path from 'path';
import { getCwd } from '../../../helpers';
import { workstation } from '../../../seams/workstation';
import type { StoryListUnreadable } from '../../../render/initSteps';
import someAppFile from './someAppFile';

const STORY_FILE = /\.stories\.(?:[cm]?[jt]sx?)$/;

/** The app's stories, or why its main config could not be read. */
export type OwnStories = { found: boolean } | { unreadable: StoryListUnreadable };

async function hasStoriesOfItsOwn(folder: string): Promise<OwnStories> {
  const storybookLoads = await storyFilesStorybookLoads(folder);
  if (typeof storybookLoads !== 'function') return { unreadable: storybookLoads };
  return {
    found: someAppFile((filePath) => STORY_FILE.test(filePath) && storybookLoads(filePath)),
  };
}

/**
 * Whether the app's Storybook loads a file: its main config is loaded and its `stories` turned
 * into matchers by `storybook/internal/common`, the code Storybook itself runs, and a file's path
 * from the app folder (`./src/Button.stories.tsx`) is tested against them. Or why the list could
 * not be read.
 */
async function storyFilesStorybookLoads(
  folder: string
): Promise<((filePath: string) => boolean) | StoryListUnreadable> {
  const appFolder = getCwd();
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
    // A folder with no main config: Storybook names that as its own error code.
    if (isMainConfigMissing(error)) return 'main-file-missing';
    // Storybook wraps the main config's own error (`data.error`), and its first line names it.
    const cause = (error as { data?: { error?: unknown } }).data?.error ?? error;
    return { loadError: String(cause).split('\n')[0] };
  }
}

/** Storybook's MainFileMissingError, by its public code (its class name is not exported stably). */
function isMainConfigMissing(error: unknown): boolean {
  return (error as { fullErrorCode?: string }).fullErrorCode === 'SB_CORE-SERVER_0006';
}

export default hasStoriesOfItsOwn;
