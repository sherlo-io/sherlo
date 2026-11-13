import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { digestDirectory } from '../digestDirectory';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

function folderWith(files: Record<string, string>): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-digest-directory-'));
  folders.push(folder);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
    fs.writeFileSync(path.join(folder, name), content);
  }
  return folder;
}

describe('a directory digest', () => {
  it('moves when a source file changes', () => {
    expect(digestDirectory(folderWith({ 'A.m': 'a' }))).not.toBe(
      digestDirectory(folderWith({ 'A.m': 'b' }))
    );
  });

  it('does not move for what a build or a machine writes into the folder', () => {
    const clean = folderWith({ 'A.m': 'a' });
    const built = folderWith({
      'A.m': 'a',
      '.cxx/cmake/out': 'x',
      'build/out': 'x',
      'DerivedData/out': 'x',
      '.kotlin/sessions/log': 'x',
      '.DS_Store': 'x',
    });

    expect(digestDirectory(built)).toBe(digestDirectory(clean));
  });
});
