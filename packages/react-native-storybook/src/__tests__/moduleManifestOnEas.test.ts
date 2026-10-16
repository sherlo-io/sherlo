'use strict';

/**
 * On Expo's cloud nothing sets SHERLO_MODULE_MANIFEST, so the bundler step writes the module map
 * when the project holds Sherlo's hand-over file (.sherlo/data.json) instead.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const applySherloTransforms = require('../../metro/applySherloTransforms');

const MODULE_MAP_PATH = ['node_modules', '.cache', 'sherlo', 'module-manifest.json'];

function moduleMapIsWrittenFor(projectRoot: string): boolean {
  const storyPath = path.join(projectRoot, 'src', 'Button.stories.tsx');
  const graph = {
    dependencies: new Map([
      [storyPath, { output: [{ data: { code: 'STORY_CODE' } }], dependencies: new Map() }],
    ]),
  };
  const result = applySherloTransforms(
    { projectRoot, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
    { enabled: true }
  );
  result.serializer.customSerializer('index.js', [], graph, { projectRoot });
  return fs.existsSync(path.join(projectRoot, ...MODULE_MAP_PATH));
}

describe('the module map on Expo cloud builds', () => {
  let projectRoot: string;

  beforeEach(() => {
    delete process.env.SHERLO_MODULE_MANIFEST;
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-eas-'));
  });
  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("writes the module map in a build whose project holds Sherlo's hand-over file", () => {
    fs.mkdirSync(path.join(projectRoot, '.sherlo'));
    fs.writeFileSync(path.join(projectRoot, '.sherlo', 'data.json'), '{}');

    expect(moduleMapIsWrittenFor(projectRoot)).toBe(true);
  });

  it('writes no module map in a build with neither the hand-over file nor SHERLO_MODULE_MANIFEST', () => {
    expect(moduleMapIsWrittenFor(projectRoot)).toBe(false);
  });
});
