/**
 * IS THERE A FILE OF THE APP'S OWN THAT MATCHES? Walks the project except the folders no one writes
 * app code in: installed packages, git, the native projects, and `.rnstorybook`, where Storybook
 * keeps its own files. Stops at the first match.
 */
import fs from 'fs';
import path from 'path';
import { getCwd } from '../../../helpers';

const SKIPPED_FOLDERS = new Set(['node_modules', '.rnstorybook', '.git', 'ios', 'android']);

function someAppFile(matches: (filePath: string) => boolean, folder: string = getCwd()): boolean {
  return fs.readdirSync(folder, { withFileTypes: true }).some((entry) => {
    const entryPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      return !SKIPPED_FOLDERS.has(entry.name) && someAppFile(matches, entryPath);
    }
    return matches(entryPath);
  });
}

export default someAppFile;
