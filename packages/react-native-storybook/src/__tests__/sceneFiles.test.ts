import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { scenes } from '../scenes';
import type { ScenePhone } from '../sceneDeviceTypes';

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

  it("the scene list carries each scene's title and name in words, in declared order", () => {
    const root = mkProject();
    const cacheDir = path.join(root, 'cache');
    const declare = (names: string[]) =>
      `export default scenes({ scenes: { ${names.map((name) => name + ': {}').join(', ')} } });`;
    writeFile(root, 'src/signin/SignIn.scenes.tsx', declare(['Empty']));
    writeFile(root, 'src/inbox/Inbox.scenes.tsx', declare(['Full', 'Empty', 'MenuOpen']));
    writeFile(root, 'src/home/Home.scenes.tsx', declare(['Default']));

    const modulePath = sceneFiles.writeBundledScenesModule(root, cacheDir);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const list = require(modulePath).default;
    const entries = Object.keys(list).map((id) => [id, list[id].title, list[id].name]);
    const sceneIds = sceneFiles.readSceneIds(root);
    fs.rmSync(root, { recursive: true, force: true });

    expect(entries).toEqual([
      ['home--default', 'Home', 'Default'],
      ['inbox--full', 'Inbox', 'Full'],
      ['inbox--empty', 'Inbox', 'Empty'],
      ['inbox--menu-open', 'Inbox', 'Menu Open'],
      ['signin--empty', 'Sign In', 'Empty'],
    ]);
    expect(sceneIds).toEqual(entries.map(([id]) => id));
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

  it('a shared precondition file changed after the bundler started rewrites the scene list', () => {
    const root = mkProject();
    writeFile(root, 'index.js', 'module.exports = 1;');
    writeFile(
      root,
      'src/phones.ts',
      "export const phone = () => ({ device: { permissions: { camera: 'granted' } } });"
    );
    writeFile(
      root,
      'src/Chat.scenes.tsx',
      "import { phone } from './phones';\nexport default scenes({ scenes: { Conversation: { given: [phone()] } } });"
    );
    const cacheDir = path.join(root, 'node_modules', '.cache', 'sherlo');
    sceneFiles.writeBundledScenesModule(root, cacheDir);
    const watcher = new EventEmitter();
    sceneFiles.keepSceneListCurrent(watcher, root, cacheDir);
    const listPath = path.join(cacheDir, 'bundled-scenes.js');
    const before = fs.readFileSync(listPath, 'utf8');

    writeFile(
      root,
      'src/phones.ts',
      "export const phone = () => ({ device: { permissions: { camera: 'denied' } } });"
    );
    watcher.emit('change', metro084Change({ modifiedFiles: ['src/phones.ts'] }));
    const after = fs.readFileSync(listPath, 'utf8');
    fs.rmSync(root, { recursive: true, force: true });

    expect(before).toContain('"camera":"granted"');
    expect(after).toContain('"camera":"denied"');
  });

  it('an entry of a given list that a shared file built is marked in the scene list', () => {
    const root = mkProject();
    writeFile(root, 'src/shared.ts', 'export const inbox = () => ({ mocks: [] });');
    writeFile(
      root,
      'src/Chat.scenes.tsx',
      `import { scenes, signedOut } from '@sherlo/react-native-storybook';
import { inbox } from './shared';
export default scenes({
  scenes: {
    Mixed: { given: [{ mocks: [] }, inbox(), [signedOut(), inbox()]] },
    Own: { given: [{ mocks: [] }, signedOut()] },
  },
});`
    );
    const scenes = sceneFiles.scenesOfProject(root);

    expect(scenes['chat--mixed'].shared).toEqual([false, true, [false, true]]);
    expect(scenes['chat--own'].shared).toBe(false);
  });

  it('a spread in a given list is refused naming the file', () => {
    const source = `import { rest } from './shared';
export default scenes({ scenes: { Spread: { given: [...rest()] } } });`;

    expect(() => sceneFiles.sceneDevicesOf('s.scenes.tsx', source)).toThrow(
      /s\.scenes\.tsx.*spread/
    );
  });

  it('two scenes with one name are refused, naming both files', () => {
    const root = mkProject();
    writeFile(root, 'src/Chat.scenes.tsx', CHAT_SCENES);
    writeFile(
      root,
      'src/more/Chat.scenes.tsx',
      `export default scenes({ scenes: { Conversation: {} } });`
    );

    let refusal = '';
    try {
      sceneFiles.scenesOfProject(root);
    } catch (error) {
      refusal = (error as Error).message;
    }
    fs.rmSync(root, { recursive: true, force: true });

    expect(refusal).toContain('chat--conversation');
    expect(refusal).toContain(path.join('src', 'Chat.scenes.tsx'));
    expect(refusal).toContain(path.join('src', 'more', 'Chat.scenes.tsx'));
  });

  it('a scene with a missing or wrong input is refused, naming the scene and the input', () => {
    const refusalOf = (scene: string): string => {
      try {
        sceneFiles.sceneIdsOfSource(
          'chat.scenes.tsx',
          `export default scenes({ scenes: { ${scene} } });`
        );
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    };

    expect(refusalOf('Empty: { play: [{ tap: 5 }] }')).toMatch(/chat\.scenes\.tsx.*Empty.*tap/);
    expect(refusalOf("Wrong: { play: [{ type: { testID: 'a' } }] }")).toMatch(/Wrong.*text/);
    expect(refusalOf("Lost: { play: [{ drag: 'a' }] }")).toMatch(/Lost.*drag/);
    expect(refusalOf('Late: { ready: 7 }')).toMatch(/Late.*ready/);
    expect(refusalOf("Odd: { play: 'a' }")).toMatch(/Odd.*play/);
    expect(refusalOf("Plain: 'a'")).toMatch(/Plain/);
    expect(refusalOf("Fine: { play: [{ tap: 'a' }, { ready: 'b' }], ready: 'c' }")).toBe('');
  });

  it('a shared precondition held in a scene-file const or helper is marked as shared', () => {
    const root = mkProject();
    writeFile(root, 'src/shared.ts', 'export const inbox = () => ({ mocks: [] });');
    writeFile(
      root,
      'src/Chat.scenes.tsx',
      `import { scenes, signedOut } from '@sherlo/react-native-storybook';
import { inbox } from './shared';
const held = inbox();
const list = [inbox(), signedOut()];
const helper = () => inbox();
function block() { const own = signedOut(); return [own, helper()]; }
export default scenes({
  scenes: {
    Held: { given: [held, signedOut()] },
    Listed: { given: [list] },
    Called: { given: [helper(), { mocks: [] }] },
    Blocked: { given: [block()] },
  },
});`
    );
    const found = sceneFiles.scenesOfProject(root);
    fs.rmSync(root, { recursive: true, force: true });

    expect(found['chat--held'].shared).toEqual([true, false]);
    expect(found['chat--listed'].shared).toEqual([[true, false]]);
    expect(found['chat--called'].shared).toEqual([true, false]);
    expect(found['chat--blocked'].shared).toEqual([[false, true]]);
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

  it('the first scene file added while the bundler runs is in the scene list without a restart', () => {
    const root = mkProject();
    writeFile(root, 'index.js', 'module.exports = 1;');
    const sdk = 'node_modules/@sherlo/react-native-storybook';
    writeFile(root, `${sdk}/package.json`, '{ "name": "@sherlo/react-native-storybook" }');
    writeFile(root, `${sdk}/dist/sceneBoot.js`, '');
    writeFile(root, `${sdk}/dist/bundledScenes.js`, '');

    // The bundler starts with no scene file, and its file watcher is the one Metro's server holds.
    const config = withStorybook({ projectRoot: root, resolver: {}, serializer: {} }, {});
    const watcher = new EventEmitter();
    const metroServer = {
      getBundler: () => ({ getBundler: () => ({ getWatcher: () => watcher }) }),
    };
    const passOn = (_request: unknown, _response: unknown, next: () => void) => next();
    config.server.enhanceMiddleware(passOn, metroServer);

    // The first scene file is added while it runs, and the watcher tells of it.
    writeFile(root, 'src/Chat.scenes.tsx', CHAT_SCENES);
    watcher.emit('change', metro084Change({ addedFiles: ['src/Chat.scenes.tsx'] }));

    const sceneList = fs.readFileSync(
      path.join(root, 'node_modules', '.cache', 'sherlo', 'bundled-scenes.js'),
      'utf8'
    );
    fs.rmSync(root, { recursive: true, force: true });

    expect(sceneList).toContain('"chat--conversation"');
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

  it("a scene's given list is read with each precondition's phone settings", () => {
    const root = mkProject();
    // Shared preconditions are the team's own functions, in a file the scene file imports.
    writeFile(
      root,
      'phones.ts',
      `export const cameraAllowed = () => ({ device: { permissions: { camera: 'granted', photos: 'denied' } } });
export function nearBerlin(latitude = 52.5) {
  return { device: { location: { latitude, longitude: 13.4 } } };
}
export const evening = (mocks) => [mocks, nearBerlin(1)];`
    );
    const source = `import { scenes, mock } from '@sherlo/react-native-storybook';
import { cameraAllowed, nearBerlin, evening } from './phones';
export default scenes({
  scenes: {
    Scan: { given: [cameraAllowed(), mock(() => import('x'), {}), { device: { permissions: { photos: 'granted' } } }, nearBerlin(-52.5)] },
    Plain: { given: [cameraAllowed(), evening([])] },
    Nothing: {},
  },
});`;
    const file = path.join(root, 'scan.scenes.tsx');
    writeFile(root, 'scan.scenes.tsx', source);

    expect(sceneFiles.sceneDevicesOf(file, source)).toEqual({
      Scan: {
        permissions: { camera: 'granted', photos: 'granted' },
        location: { latitude: -52.5, longitude: 13.4 },
      },
      Plain: {
        permissions: { camera: 'granted', photos: 'denied' },
        location: { latitude: 1, longitude: 13.4 },
      },
      Nothing: {},
    });
  });

  it('a scene file with a file-wide setup or device key is refused naming the file', () => {
    const fileWide = `export default scenes({ device: { permissions: { camera: 'granted' } }, scenes: { Scan: {} } });`;
    const setup = `export default scenes({ setup: signedIn, scenes: { Scan: {} } });`;
    const ownKeys = `export default scenes({ scenes: { Scan: { mocks: [] } } });`;

    expect(() => sceneFiles.sceneDevicesOf('scan.scenes.tsx', fileWide)).toThrow(
      /scan\.scenes\.tsx.*"device".*given/
    );
    expect(() => sceneFiles.sceneIdsOfSource('scan.scenes.tsx', setup)).toThrow(
      /scan\.scenes\.tsx.*"setup".*given/
    );
    expect(() => sceneFiles.sceneDevicesOf('scan.scenes.tsx', ownKeys)).toThrow(
      /scan\.scenes\.tsx.*scene Scan.*"mocks".*given/
    );
  });

  it("a scene's member precondition is read as signed out or fresh install", () => {
    const root = mkProject();
    writeFile(
      root,
      'members.ts',
      `import { freshInstall, given } from '@sherlo/react-native-storybook';
export const newcomer = () => given(freshInstall(), { device: { permissions: { notifications: 'denied' } } });`
    );
    const source = `import { scenes, signedOut } from '@sherlo/react-native-storybook';
import { newcomer } from './members';
export default scenes({
  scenes: {
    Login: { given: [signedOut()] },
    Welcome: { given: [signedOut(), newcomer()] },
    Home: {},
  },
});`;
    const file = path.join(root, 'login.scenes.tsx');
    writeFile(root, 'login.scenes.tsx', source);

    expect(sceneFiles.sceneDevicesOf(file, source)).toEqual({
      Login: { member: 'signed-out' },
      Welcome: { member: 'fresh-install', permissions: { notifications: 'denied' } },
      Home: {},
    });
  });

  it("a scene's permissions and location are read from the scene file, the scene's over the file's", () => {
    const source = `import { scenes } from '@sherlo/react-native-storybook/scenes';
const file = { device: { permissions: { camera: 'granted', photos: 'denied' }, location: { latitude: 1, longitude: 2 } } };
export default scenes({
  scenes: {
    Scan: { given: [file, { device: { permissions: { photos: 'granted' }, location: { latitude: -52.5, longitude: 13.4 } } }] },
    Plain: { given: [file] },
  },
});`;

    expect(sceneFiles.sceneDevicesOf('scan.scenes.tsx', source)).toEqual({
      Scan: {
        permissions: { camera: 'granted', photos: 'granted' },
        location: { latitude: -52.5, longitude: 13.4 },
      },
      Plain: {
        permissions: { camera: 'granted', photos: 'denied' },
        location: { latitude: 1, longitude: 2 },
      },
    });
  });

  it('a device field that is not a literal is refused with the file and scene named', () => {
    const call = `export default scenes({ scenes: { Third: { given: [{ device: { permissions: { camera: grant() } } }] } } });`;

    expect(() => sceneFiles.sceneDevicesOf('t.scenes.tsx', call)).toThrow(/t\.scenes\.tsx.*Third/);
  });

  it('scenesOfProject names each scene by id with its key and its file, and carries its phone', () => {
    const root = mkProject();
    writeFile(
      root,
      'chat.scenes.tsx',
      "export default scenes({ scenes: { 'Empty Chat': { given: [{ device: { location: { latitude: 1, longitude: 2 } } }] } } });"
    );
    const scene = sceneFiles.scenesOfProject(root)['chat--empty-chat'];
    const device: ScenePhone = scene.device;

    expect(scene.key).toBe('Empty Chat');
    expect(device.location).toEqual({ latitude: 1, longitude: 2 });
  });

  it('stable stringify sorts keys at every depth', () => {
    expect(stableStringify({ b: [{ d: 1, c: 2 }], a: null })).toBe(
      '{"a":null,"b":[{"c":2,"d":1}]}'
    );
  });
});
