import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { scenes } from '../scenes';

const sceneFiles = require('../../metro/sceneFiles');
const sourceFiles = require('../../metro/sourceFiles');
const stableStringify = require('../../metro/stableStringify');
const applySherloTransforms = require('../../metro/applySherloTransforms');
const withStorybook = require('../../metro/withStorybook');

function mkProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-scene-files-'));
}

function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

const CHAT_SCENES = `import { scenes } from '@sherlo/react-native-storybook/scenes';
export default scenes({
  scenes: { Conversation: { play: [{ tap: 'chat-row' }] }, 'Empty Chat': {} },
});`;

describe('scene files are found and bundled', () => {
  const ENV_FLAG = 'SHERLO_MODULE_MANIFEST';

  beforeEach(() => {
    process.env[ENV_FLAG] = '1';
  });
  afterEach(() => {
    delete process.env[ENV_FLAG];
  });

  it('a .scenes.tsx file is found and each of its scenes gets an id in the module manifest', () => {
    const root = mkProject();
    writeFile(root, 'src/chat/Chat.scenes.tsx', CHAT_SCENES);
    writeFile(root, 'src/chat/Chat.tsx', 'export default 1;');
    writeFile(root, 'node_modules/dep/Dep.scenes.js', CHAT_SCENES);

    const files = sceneFiles.findSceneFiles(root).map((file: string) => path.relative(root, file));
    const result = applySherloTransforms(
      { projectRoot: root, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
      { enabled: true }
    );
    result.serializer.customSerializer(
      'index.js',
      [],
      { dependencies: new Map() },
      { projectRoot: root }
    );
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(root, 'node_modules', '.cache', 'sherlo', 'module-manifest.json'),
        'utf8'
      )
    );
    fs.rmSync(root, { recursive: true, force: true });

    expect(files).toEqual([path.join('src', 'chat', 'Chat.scenes.tsx')]);
    expect(manifest.sceneIds).toEqual(['chat--conversation', 'chat--empty-chat']);
  });

  it('an app with scene files and no Storybook setup bundles without a setup file', () => {
    const root = mkProject();
    writeFile(root, 'index.js', 'module.exports = 1;');
    writeFile(root, 'src/Chat.scenes.ts', CHAT_SCENES);

    const config = withStorybook({ projectRoot: root, resolver: {}, serializer: {} }, {});
    const launchEntry = fs.readFileSync(
      path.join(root, 'node_modules', '.cache', 'sherlo', 'launch-entry.js'),
      'utf8'
    );
    const setupFolders = ['.rnstorybook', '.storybook'].filter((folder) =>
      fs.existsSync(path.join(root, folder))
    );
    fs.rmSync(root, { recursive: true, force: true });

    expect(config.resolver.resolveRequest).toEqual(expect.any(Function));
    expect(setupFolders).toEqual([]);
    expect(launchEntry).not.toContain('sherlo-launch-entry:storybook');
    expect(launchEntry).toContain('sherlo-launch-entry:app');
  });

  it('a scene file name decides alone, in any source extension', () => {
    const accepted = ['a.scenes.tsx', 'a.scenes.ts', 'a.scenes.jsx', 'a.scenes.js'];
    const refused = ['a.stories.tsx', 'scenes.tsx', 'a.scenes.json'];

    expect(accepted.map(sourceFiles.isSceneFile)).toEqual([true, true, true, true]);
    expect(refused.map(sourceFiles.isSceneFile)).toEqual([false, false, false]);
  });

  it('scenes() hands back exactly what it is given', () => {
    const file = { scenes: { Home: { ready: 'home' } } };

    expect(scenes(file)).toBe(file);
  });

  it('stable stringify sorts keys at every depth', () => {
    expect(stableStringify({ b: [{ d: 1, c: 2 }], a: null })).toBe(
      '{"a":null,"b":[{"c":2,"d":1}]}'
    );
  });
});
