import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const { loadNewerStorybookWrapper } = require('../../metro/withStorybook');

const projectRoots: string[] = [];

/** A project whose node_modules holds only the Storybook files named in `files`. */
function createProjectWithStorybook(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-wrapper-'));
  projectRoots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  for (const [relativePath, source] of Object.entries(files)) {
    const file = path.join(root, 'node_modules/@storybook/react-native', relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return root;
}

afterEach(() => {
  for (const root of projectRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('the Storybook wrapper the SDK picks', () => {
  it('with no newer Storybook wrapper installed the older wrapper of Storybook 9.0 is used', () => {
    const root = createProjectWithStorybook({
      'package.json': JSON.stringify({
        name: '@storybook/react-native',
        exports: { './metro/withStorybook': './older.js' },
      }),
      'older.js': "module.exports = function olderWrapper() { return 'older'; };",
    });

    expect(loadNewerStorybookWrapper(root)()).toBe('older');
  });
});
