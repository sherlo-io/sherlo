'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ===========================================================================
// metro/entry.js - the entry the CLI generates, across Storybook config shapes
// ===========================================================================
//
// generateEntry() writes the wrapper entry the CLI's bundling road uses in
// place of the app's own: seam first, then the Storybook config directory (so
// getStorybookUI() runs eagerly), then the real entry.
//
// The middle line is the one that moves with the Storybook major, because
// upstream's default config directory changed from `.storybook` (v8) to
// `.rnstorybook` (v9+), and a project may have neither. Those are the three
// shapes a customer's project can present, and the generated entry has to be
// right in all of them - a wrong or missing config require means Storybook
// never eagerly loads and the run captures the app instead of the stories.
//
// generateEntry resolves the config directory from process.cwd(), the same
// way upstream does, so each case runs with cwd set to its own project.
// ===========================================================================

const PACKAGE_ROOT = path.resolve(__dirname, '../..');
// entry.js bakes in require.resolve('../src/seam.js'), which returns a realpath.
const SEAM_PATH = fs.realpathSync(path.join(PACKAGE_ROOT, 'src/seam.js'));

const { generateEntry } = require('../../metro/entry');

/**
 * Creates a throwaway project containing `configDirName` (when given) and an
 * `index.js`, runs generateEntry from inside it, and returns the generated
 * file's text.
 */
function generatedEntryFor(configDirName: string | null): string {
  const projectRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-metro-entry-'))
  );
  const previousCwd = process.cwd();

  try {
    if (configDirName) fs.mkdirSync(path.join(projectRoot, configDirName));
    fs.writeFileSync(path.join(projectRoot, 'index.js'), '// the app\n');

    process.chdir(projectRoot);
    return fs.readFileSync(generateEntry(projectRoot, 'index.js'), 'utf8');
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

describe('metro/entry.js - generateEntry across Storybook config shapes', () => {
  it('requires .rnstorybook, upstream default from Storybook 9 on', () => {
    const generated = generatedEntryFor('.rnstorybook');

    expect(generated).toContain('.rnstorybook');
    expect(generated).not.toContain('.storybook"');
  });

  it('falls back to .storybook, upstream default on Storybook 8', () => {
    const generated = generatedEntryFor('.storybook');

    expect(
      generated.includes('.storybook'),
      'a project on the Storybook 8 layout got an entry that never requires its config ' +
        'directory - getStorybookUI() would not run eagerly, and the run would capture the ' +
        "customer's app instead of their stories"
    ).toBe(true);
    expect(generated).not.toContain('.rnstorybook');
  });

  it('emits no config require at all when the project has neither directory', () => {
    const generated = generatedEntryFor(null);

    expect(generated).not.toContain('.rnstorybook');
    expect(generated).not.toContain('.storybook');
  });

  it('requires the seam FIRST in every shape, before any app code can run', () => {
    for (const configDirName of ['.rnstorybook', '.storybook', null]) {
      const generated = generatedEntryFor(configDirName);
      const requireLines = generated
        .split('\n')
        .filter((line) => line.startsWith('require('))
        .map((line) => line.trim());

      expect(
        requireLines[0],
        `with ${configDirName ?? 'no config directory'}, the generated entry does not ` +
          'require the seam first - app code would run before the seam is installed'
      ).toBe(`require(${JSON.stringify(SEAM_PATH)});`);
      expect(requireLines[requireLines.length - 1]).toContain('index.js');
    }
  });
});
