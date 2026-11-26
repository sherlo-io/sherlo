/**
 * IS THERE A FILE OF THE APP'S OWN THAT MATCHES? Walks the project except the folders no one writes
 * app code in: installed packages, git, the native projects, and the app's Storybook folder
 * (./storybookFolder: `.rnstorybook`, or `.storybook` kept from Storybook 8), where Storybook keeps
 * its own files and example stories. Stops at the first match.
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';
import storybookFolder from './storybookFolder';

const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'ios', 'android']);

function someAppFile(matches: (filePath: string) => boolean): boolean {
  const appFolder = getCwd();
  const storybookFolderName = storybookFolder();
  const storybookPath = storybookFolderName ? path.join(appFolder, storybookFolderName) : null;

  const walk = (folder: string): boolean =>
    fs.readdirSync(folder, { withFileTypes: true }).some((entry) => {
      const entryPath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        return !SKIPPED_FOLDERS.has(entry.name) && entryPath !== storybookPath && walk(entryPath);
      }
      return matches(entryPath);
    });

  return walk(appFolder);
}

export default someAppFile;
