/**
 * What a captured story ran as real code: the recording stand-in the polyfill puts on every app
 * module the bundler listed, installed only when the JavaScript starts in a capture's testing
 * mode, and what the SDK reads of it for the story on screen.
 */
import * as fs from 'fs';
import * as path from 'path';

const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

import { activateMocksForStory } from '../../getStorybook/storyMockActivation';
import { activateMocks, clearMocks } from '../../mocking/registry';
import {
  startStillRealStory,
  stillRealModulesOfStory,
  stillRealModulesWithExports,
} from '../../mocking/stillReal';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const stillRealBundler = require('../../../metro/stillReal.js');

const polyfillSource = fs.readFileSync(path.join(__dirname, '../../../metro/polyfill.js'), 'utf8');

type Watcher = {
  isTesting: boolean;
  startStory: () => void;
  readStory: () => { module: string; exports: string[] }[];
};

// The polyfill run as the app's JavaScript starts in `mode`, with the bundler's list of modules.
function startAppIn(mode: string, paths: Record<string, string>) {
  const original = vi.fn();
  const fakeGlobal: Record<string, any> = {
    __turboModuleProxy: (name: string) =>
      name === 'SherloModule' ? { getSherloConstants: () => ({ mode }) } : null,
    __d: original,
    __sherloStillRealPaths: paths,
  };
  // eslint-disable-next-line no-new-func
  new Function('global', `"use strict";\n${polyfillSource}`)(fakeGlobal);
  return { fakeGlobal, original };
}

// Define and evaluate module `id`, whose factory leaves `exportsObject`, and give back its exports
// as the app's other modules would get them.
function evaluateModule(app: ReturnType<typeof startAppIn>, id: number, exportsObject: any): any {
  if (app.fakeGlobal.__d === app.original) return { exports: exportsObject };
  app.fakeGlobal.__d(
    (_g: unknown, _r: unknown, _i: unknown, _a: unknown, mod: any) => {
      mod.exports = exportsObject;
    },
    id,
    []
  );
  const wrapped = app.original.mock.calls[app.original.mock.calls.length - 1][0];
  const module: any = { exports: {} };
  wrapped.call(undefined, app.fakeGlobal, null, null, null, module, module.exports, []);
  return module;
}

function installWatcherOf(app: ReturnType<typeof startAppIn>): Watcher {
  (globalThis as { __sherloStillReal?: Watcher }).__sherloStillReal =
    app.fakeGlobal.__sherloStillReal;
  return app.fakeGlobal.__sherloStillReal;
}

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
});

afterEach(() => {
  delete (globalThis as { __sherloStillReal?: Watcher }).__sherloStillReal;
  clearMocks();
  vi.clearAllMocks();
});

describe('what a captured story ran as real code', () => {
  it('a story lists exactly the app modules its screen called, each once, with the exports it read', () => {
    const app = startAppIn('testing', {
      '7': 'src/chat/client.ts',
      '8': 'src/profile.ts',
      '9': 'src/unused.ts',
    });
    const client = evaluateModule(app, 7, { sendMessage: () => 1, other: () => 2 });
    const profile = evaluateModule(app, 8, { name: 'Ada' });
    evaluateModule(app, 9, { never: 1 });
    installWatcherOf(app);

    startStillRealStory();
    client.exports.sendMessage();
    client.exports.sendMessage();
    client.exports.other();
    expect(profile.exports.name).toBe('Ada');

    expect(stillRealModulesWithExports()).toEqual([
      { module: 'src/chat/client.ts', exports: ['other', 'sendMessage'] },
      { module: 'src/profile.ts', exports: ['name'] },
    ]);
    expect(stillRealModulesOfStory()).toEqual(['src/chat/client.ts', 'src/profile.ts']);
  });

  it('the next story starts with nothing read, and an export is the very value the module made', () => {
    const real = { sendMessage: () => 1 };
    const app = startAppIn('testing', { '7': 'src/chat.ts' });
    const chat = evaluateModule(app, 7, real);
    installWatcherOf(app);

    expect(chat.exports.sendMessage).toBe(real.sendMessage);
    startStillRealStory();

    expect(stillRealModulesOfStory()).toEqual([]);
  });

  it('activating the same story again starts its list empty, as it does its unanswered requests', () => {
    const app = startAppIn('testing', { '7': 'src/chat.ts' });
    const chat = evaluateModule(app, 7, { sendMessage: () => 1 });
    installWatcherOf(app);

    activateMocksForStory('chat--default');
    expect(chat.exports.sendMessage).toBeDefined();
    expect(stillRealModulesOfStory()).toEqual(['src/chat.ts']);

    activateMocksForStory('chat--default');
    expect(stillRealModulesOfStory()).toEqual([]);
  });

  it('a module the story mocks is never listed as real', () => {
    const app = startAppIn('testing', { '7': 'src/chat/client.ts', '8': 'src/profile.ts' });
    const client = evaluateModule(app, 7, { sendMessage: () => 1 });
    const profile = evaluateModule(app, 8, { name: 'Ada' });
    installWatcherOf(app);
    activateMocks({ './src/chat/client': { sendMessage: () => 2 } } as any);

    startStillRealStory();
    client.exports.sendMessage();
    profile.exports.name;

    expect(stillRealModulesOfStory()).toEqual(['src/profile.ts']);
  });

  it('an app not launched for a capture installs no watching and lists nothing', () => {
    for (const mode of ['storybook', 'default']) {
      const app = startAppIn(mode, { '7': 'src/chat.ts' });
      expect(app.fakeGlobal.__sherloStillReal).toBeUndefined();
    }

    startStillRealStory();
    expect(stillRealModulesOfStory()).toEqual([]);
  });

  it('leaves a module the bundler did not list as it was, and keeps a called export callable', () => {
    const real = { a: 1 };
    const app = startAppIn('testing', { '99': 'src/other.ts', '7': 'src/fn.ts' });
    expect(evaluateModule(app, 5, real).exports).toBe(real);

    const fn = evaluateModule(
      app,
      7,
      Object.assign(() => 'called', { extra: 1 })
    );
    installWatcherOf(app);
    startStillRealStory();
    expect(fn.exports()).toBe('called');
    expect(stillRealModulesWithExports()).toEqual([{ module: 'src/fn.ts', exports: ['(call)'] }]);
  });

  it('the list is read once per capture, not once per settle check', () => {
    const readStory = vi.fn(() => [{ module: 'src/chat.ts', exports: ['sendMessage'] }]);
    (globalThis as { __sherloStillReal?: Watcher }).__sherloStillReal = {
      isTesting: true,
      startStory: vi.fn(),
      readStory,
    };

    // Everything the story's lifecycle does - start it, activate its mocks - reads nothing.
    startStillRealStory();
    expect(readStory).not.toHaveBeenCalled();

    // The capture reads the record: one read.
    expect(stillRealModulesOfStory()).toEqual(['src/chat.ts']);
    expect(readStory).toHaveBeenCalledTimes(1);
  });
});

describe('the bundler list', () => {
  const create = (() => {
    let next = 0;
    const ids = new Map<string, number>();
    return (p: string) => ids.get(p) ?? (ids.set(p, (next += 1)), next);
  })();

  it("lists the project's own modules, from the root with no leading './', and no others", () => {
    const graph = new Map(
      [
        '/app/src/chat/client.ts',
        '/app/node_modules/react/index.js',
        '/app/node_modules/@sherlo/react-native-storybook/dist/x.js',
        '/app/src/Chat.stories.tsx',
        '/app/.rnstorybook/storybook.requires.ts',
        '/app/.sherlo/mocks/a.js',
        '/other/outside.ts',
        '/app/src/logo.png',
      ].map((p) => [p, {}])
    );

    const paths = stillRealBundler.appModulePathsOf(graph, create, '/app');

    expect(Object.values(paths)).toEqual(['src/chat/client.ts']);
  });

  it('adds one script before the modules, naming the list', () => {
    const delegate = vi.fn(() => 'bundle');
    const graph = { dependencies: new Map([['/app/src/a.ts', {}]]) };
    const options = { createModuleId: create, projectRoot: '/app' };

    stillRealBundler.withStillRealList(delegate, '/app')('entry', [], graph, options);

    const modules = (delegate.mock.calls[0] as any[])[1];
    expect(modules).toHaveLength(1);
    expect(modules[0].output[0].data.code).toContain('__sherloStillRealPaths');
  });

  it('a bundler config carries the list serializer unless Sherlo is disabled', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const applySherloTransforms = require('../../../metro/applySherloTransforms');
    const configFor = (enabled: boolean) => {
      const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sherlo-still-real-'));
      try {
        return applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    };

    expect(typeof configFor(true).serializer.customSerializer).toBe('function');
    expect(configFor(false).serializer.customSerializer).toBeUndefined();
  });
});
