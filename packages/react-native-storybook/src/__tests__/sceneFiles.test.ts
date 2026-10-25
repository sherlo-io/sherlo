import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
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

// The `change` event of metro-file-map 0.84 (src/index.js): `changes` holds ReadonlyFileSystemChanges
// (flow-types.d.ts), each file an iterable entry [path relative to rootDir, metadata].
type Metro084Files = Iterable<readonly [string, unknown]>;
type Metro084Change = {
  changes: {
    addedDirectories: Iterable<string>;
    removedDirectories: Iterable<string>;
    addedFiles: Metro084Files;
    modifiedFiles: Metro084Files;
    removedFiles: Metro084Files;
  };
  logger: null;
  rootDir: string;
};

function metro084Change(files: {
  addedFiles?: string[];
  modifiedFiles?: string[];
  removedFiles?: string[];
}): Metro084Change {
  const entries = (paths: string[] = []): Metro084Files =>
    new Map(paths.map((file): [string, unknown] => [file, ['', 0, 1, 0, '', null, 0]]));
  return {
    changes: {
      addedDirectories: new Set(),
      removedDirectories: new Set(),
      addedFiles: entries(files.addedFiles),
      modifiedFiles: entries(files.modifiedFiles),
      removedFiles: entries(files.removedFiles),
    },
    logger: null,
    rootDir: '/project',
  };
}

// The `change` event of metro-file-map 0.83 (flow-types.d.ts, ChangeEvent): an `eventsQueue` of
// events, each with the absolute `filePath`.
type Metro083Change = {
  logger: null;
  eventsQueue: { filePath: string; type: 'add' | 'change' | 'delete'; metadata?: unknown }[];
};

function metro083Change(filePath: string, type: 'add' | 'change' | 'delete'): Metro083Change {
  return { logger: null, eventsQueue: [{ filePath, type, metadata: {} }] };
}

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

  it('a scene named MenuOpen gets the id inbox--menu-open, as Storybook names a story exported as MenuOpen', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { storyNameFromExport, toId } = require('storybook/internal/csf');
    const names = ['MenuOpen', 'Full', 'Item2FullHD', 'Sign_inV2', 'Empty Chat'];
    const source = `export default scenes({ scenes: { ${names
      .map((name) => `'${name}': {}`)
      .join(', ')} } });`;

    const ids = sceneFiles.sceneIdsOfSource('inbox.scenes.tsx', source);

    expect(ids).toEqual(names.map((name) => toId('inbox', storyNameFromExport(name))));
    expect(ids.slice(0, 2)).toEqual(['inbox--menu-open', 'inbox--full']);
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

  it("a scene file changed under Metro 0.84's change event rewrites the scene list", () => {
    const root = mkProject();
    writeFile(root, 'index.js', 'module.exports = 1;');
    writeFile(root, 'src/Chat.scenes.tsx', CHAT_SCENES);
    const cacheDir = path.join(root, 'node_modules', '.cache', 'sherlo');
    sceneFiles.writeBundledScenesModule(root, cacheDir);
    const watcher = new EventEmitter();
    sceneFiles.keepSceneListCurrent(watcher, root, cacheDir);
    const listPath = path.join(cacheDir, 'bundled-scenes.js');

    writeFile(root, 'src/Inbox.scenes.tsx', CHAT_SCENES.replace('Conversation', "'Menu Open'"));
    watcher.emit('change', metro084Change({ modifiedFiles: ['src/Inbox.scenes.tsx'] }));
    const afterChange = fs.readFileSync(listPath, 'utf8');

    fs.rmSync(path.join(root, 'src', 'Inbox.scenes.tsx'));
    watcher.emit('change', metro084Change({ removedFiles: ['src/Inbox.scenes.tsx'] }));
    const afterRemoval = fs.readFileSync(listPath, 'utf8');
    fs.rmSync(root, { recursive: true, force: true });

    expect(afterChange).toContain('"inbox--menu-open"');
    expect(afterRemoval).not.toContain('"inbox--menu-open"');
  });

  it("a scene file changed under Metro 0.83's change event rewrites the scene list", () => {
    const root = mkProject();
    writeFile(root, 'index.js', 'module.exports = 1;');
    writeFile(root, 'src/Chat.scenes.tsx', CHAT_SCENES);
    const cacheDir = path.join(root, 'node_modules', '.cache', 'sherlo');
    sceneFiles.writeBundledScenesModule(root, cacheDir);
    const watcher = new EventEmitter();
    sceneFiles.keepSceneListCurrent(watcher, root, cacheDir);

    writeFile(root, 'src/Inbox.scenes.tsx', CHAT_SCENES.replace('Conversation', "'Menu Open'"));
    watcher.emit('change', metro083Change(path.join(root, 'src', 'Inbox.scenes.tsx'), 'add'));
    const sceneList = fs.readFileSync(path.join(cacheDir, 'bundled-scenes.js'), 'utf8');
    fs.rmSync(root, { recursive: true, force: true });

    expect(sceneList).toContain('"inbox--menu-open"');
  });

  it('a scene file added after the bundler started is in the scene list of the next bundle', () => {
    const root = mkProject();
    writeFile(root, 'index.js', 'module.exports = 1;');
    writeFile(root, 'src/Chat.scenes.tsx', CHAT_SCENES);
    const sdk = 'node_modules/@sherlo/react-native-storybook';
    writeFile(root, `${sdk}/package.json`, '{ "name": "@sherlo/react-native-storybook" }');
    writeFile(root, `${sdk}/dist/sceneBoot.js`, '');
    writeFile(root, `${sdk}/dist/bundledScenes.js`, '');

    // The bundler starts, and its file watcher is the one Metro's server holds.
    const config = withStorybook({ projectRoot: root, resolver: {}, serializer: {} }, {});
    const watcher = new EventEmitter();
    const metroServer = {
      getBundler: () => ({ getBundler: () => ({ getWatcher: () => watcher }) }),
    };
    const passOn = (_request: unknown, _response: unknown, next: () => void) => next();
    config.server.enhanceMiddleware(passOn, metroServer);

    // A scene file is added while it runs, and the watcher tells of it.
    writeFile(root, 'src/Inbox.scenes.tsx', CHAT_SCENES.replace('Conversation', "'Menu Open'"));
    watcher.emit('change', metro084Change({ addedFiles: ['src/Inbox.scenes.tsx'] }));

    const sceneList = fs.readFileSync(
      path.join(root, 'node_modules', '.cache', 'sherlo', 'bundled-scenes.js'),
      'utf8'
    );
    fs.rmSync(root, { recursive: true, force: true });

    expect(sceneList).toContain('"chat--conversation"');
    expect(sceneList).toContain('"inbox--menu-open"');
    expect(sceneList).toContain('"./src/Inbox.scenes.tsx"');
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
