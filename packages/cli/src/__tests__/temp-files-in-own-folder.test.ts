/**
 * Two pushes on one machine must never share a temp path, so a CLI source file makes a folder of
 * its own with mkdtemp and puts its temp files inside it. A fixed path under the system temp
 * folder is shared by every push that runs at once, and one push removes it from under another.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.resolve(__dirname, '..');
const TEMP_PATH_JOIN = /path\.join\(\s*os\.tmpdir\(\)/;
const OWN_FOLDER_CALL = /mkdtemp(Sync)?\(\s*$/;

function sourceFiles(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'node_modules'
        ? []
        : sourceFiles(entryPath);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

describe('temp files in a folder of their own', () => {
  it('a CLI source file writes temp files only inside a folder of its own', () => {
    const offences: string[] = [];

    for (const file of sourceFiles(SOURCE_ROOT)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');

      // Every join onto the temp folder must be the argument of mkdtemp / mkdtempSync.
      lines.forEach((line, index) => {
        const column = line.search(TEMP_PATH_JOIN);
        if (column === -1) return;
        if (!OWN_FOLDER_CALL.test(line.slice(0, column))) {
          offences.push(`${path.relative(SOURCE_ROOT, file)}:${index + 1}`);
        }
      });
    }

    expect(offences).toEqual([]);
  });
});
