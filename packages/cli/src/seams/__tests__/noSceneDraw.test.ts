import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// Built from two pieces, so this file does not name the package it keeps out.
const SCENE_DRAW = ['@sherlo', 'scene-draw'].join('/');
const PACKAGES_FOLDER = path.resolve(__dirname, '../../../..');
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'build', 'coverage']);
const READ_SUFFIXES = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'];

function namesTheDraw(file: string): boolean {
  try {
    return fs.readFileSync(file, 'utf8').includes(SCENE_DRAW);
  } catch {
    // Other tests make and remove files under packages/ while this one walks it: a file that is
    // gone by the time it is read cannot be a package that names the draw.
    return false;
  }
}

function filesUnder(folder: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    // A folder removed while the walk runs holds no file to check.
    return [];
  }
  return entries.flatMap((entry) => {
    if (SKIPPED_FOLDERS.has(entry.name)) return [];
    const full = path.join(folder, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

describe('the scene draw stays private', () => {
  it('no public package depends on, imports or bundles the private scene draw', () => {
    const files = filesUnder(PACKAGES_FOLDER);
    const namingIt = files
      .filter((file) => READ_SUFFIXES.some((suffix) => file.endsWith(suffix)))
      .filter(namesTheDraw)
      .map((file) => path.relative(PACKAGES_FOLDER, file));

    expect(namingIt).toEqual([]);

    // The packed CLI is its dist folder: no file of the draw is among them.
    const distFolder = path.join(PACKAGES_FOLDER, 'cli/dist');
    const packedCli = files.filter((file) => file.startsWith(distFolder));
    // (the declaration of this very test sits in dist/ as noSceneDraw.test.d.ts: tests are left out)
    const ofTheDraw = packedCli.filter(
      (file) => !file.includes('__tests__') && /scene-?draw/i.test(file)
    );
    expect(ofTheDraw).toEqual([]);
  });
});
