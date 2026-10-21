'use strict';

// Spike resolve-like-metro: what the stand-in's own require does, and what an import cycle through
// the stand-in hands the module that is in it.

vi.mock('../../SherloModule', () => ({
  default: { getMode: () => 'testing' },
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vm from 'vm';

import createMockable, { createLazyMockable } from '../../mocking/createMockable';
import activateStoryMocks from '../../mocking/activateStoryMocks';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';

const applySherloTransforms = require('../../../metro/applySherloTransforms');
const mockShims = require('../../../metro/mockShims');
const { createResolveLikeMetro } = require('../../../metro/resolveLikeMetro');

afterEach(() => {
  clearMocks();
  __resetShimmedKeysForTests();
});

function aliasProject(): { root: string; resolverConfig: object } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-cycle-'));
  const installed = path.dirname(require.resolve('metro-resolver/package.json'));
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(installed, path.join(root, 'node_modules', 'metro-resolver'), 'dir');
  const files: Record<string, string> = {
    // The real module imports a helper first; the helper imports the real module back by its alias.
    'src/components/Chat.js':
      "var Helper = require('components/Helper');\nexports.Chat = function Chat() { return 'chat'; };\n",
    'src/components/Helper.js':
      "var chatModule = require('components/Chat');\n" +
      "exports.use = function () { return chatModule.Chat ? 'ok' : 'stranded'; };\n",
    'src/App.js':
      "require('components/Chat');\nmodule.exports = require('components/Helper').use();\n",
    // The real app's shape: a barrel (`export { default as ChatProvider } from './ChatProvider'` and
    // `export *`, as Babel compiles them) whose provider imports something that imports the barrel.
    'src/components/provider/Chat/index.js':
      "var _CP = require('./ChatProvider');\n" +
      "Object.defineProperty(exports, 'ChatProvider', { enumerable: true, get: function () { return _CP.default; } });\n" +
      'Object.keys(_CP).forEach(function (k) {\n' +
      "  if (k === 'default' || k === '__esModule') return;\n" +
      '  Object.defineProperty(exports, k, { enumerable: true, get: function () { return _CP[k]; } });\n' +
      '});\n',
    'src/components/provider/Chat/ChatProvider.js':
      "exports.__esModule = true;\nvar Messages = require('components/Messages');\n" +
      "exports.default = function ChatProvider() { return 'provider'; };\nexports.useChat = function () {};\n",
    'src/components/Messages.js':
      "var barrel = require('components/provider/Chat');\n" +
      "exports.provider = function () { return typeof barrel.ChatProvider; };\n",
    'src/Shell.js':
      "var _Chat = require('components/provider/Chat');\n" +
      "module.exports = typeof _Chat.ChatProvider + ':' + require('components/Messages').provider();\n",
    'src/Chat.stories.tsx':
      "export const S = { parameters: { sherlo: { mocks: { 'components/Chat': {}, 'components/provider/Chat': {} } } } };",
  };
  for (const rel of Object.keys(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), files[rel], 'utf8');
  }
  return { root, resolverConfig: { extraNodeModules: { components: path.join(root, 'src/components') } } };
}

// A tiny CommonJS loader: every require goes through `resolve`, as the bundler's does.
function runApp(entry: string, resolve: (name: string, from: string) => string): unknown {
  const cache = new Map<string, { exports: unknown }>();
  function load(file: string): unknown {
    const cached = cache.get(file);
    if (cached) return cached.exports;
    const module = { exports: {} as unknown };
    cache.set(file, module);
    const requireFrom = (name: string): unknown =>
      name === '@sherlo/react-native-storybook/mocking'
        ? { createMockable, createLazyMockable }
        : load(resolve(name, file));
    const wrapped = vm.runInThisContext(
      '(function (module, exports, require) {' + fs.readFileSync(file, 'utf8') + '\n})'
    );
    wrapped(module, module.exports, requireFrom);
    return module.exports;
  }
  load(entry);
  return cache.get(entry)!.exports;
}

// The shim file as it was before the stand-in became lazy: it required the real module first.
function eagerShimContent(content: string): string {
  return content
    .replace('createLazyMockable', 'createMockable')
    .replace(', function () { return require(', ', require(')
    .replace('); });', '));');
}

function setup(): {
  root: string;
  withoutMocks: (file: string) => unknown;
  withMocks: (file: string, eager?: boolean) => unknown;
} {
  const { root, resolverConfig } = aliasProject();
  const result = applySherloTransforms({ projectRoot: root, resolver: resolverConfig });
  const resolveLikeMetro = createResolveLikeMetro({ resolver: resolverConfig }, root);
  const plain = (name: string, from: string): string => resolveLikeMetro(name, from);
  const redirected = (name: string, from: string): string =>
    result.resolver.resolveRequest(
      {
        originModulePath: from,
        resolveRequest: (c: { originModulePath: string }, n: string) => ({
          type: 'sourceFile',
          filePath: resolveLikeMetro(n, c.originModulePath),
        }),
      },
      name,
      'ios'
    ).filePath;
  return {
    root,
    withoutMocks: (file) => runApp(path.join(root, file), plain),
    withMocks: (file, eager) => {
      if (eager) {
        const shimDir = path.join(root, 'node_modules', '.cache', 'sherlo', 'mocks');
        for (const name of fs.readdirSync(shimDir)) {
          const shim = path.join(shimDir, name);
          fs.writeFileSync(shim, eagerShimContent(fs.readFileSync(shim, 'utf8')), 'utf8');
        }
      }
      return runApp(path.join(root, file), redirected);
    },
  };
}

describe('the stand-in in a real app', () => {
  it("its own request for the mocked name is not sent back to it: the resolver exempts the stand-in's own folder", () => {
    const { root, resolverConfig } = aliasProject();
    const result = applySherloTransforms({ projectRoot: root, resolver: resolverConfig });
    const resolveLikeMetro = createResolveLikeMetro({ resolver: resolverConfig }, root);
    const importer = path.join(root, 'src/App.js');
    const context = (originModulePath: string) => ({
      originModulePath,
      resolveRequest: (c: { originModulePath: string }, name: string) => ({
        type: 'sourceFile',
        filePath: resolveLikeMetro(name, c.originModulePath),
      }),
    });

    const fromImporter = result.resolver.resolveRequest(context(importer), 'components/Chat', 'ios');
    // What an older stand-in required: the bare alias, sent from the stand-in's own file.
    const oldShimContent = mockShims.generateShimContent('components/Chat', 'components/Chat');
    const fromTheStandIn = result.resolver.resolveRequest(
      context(fromImporter.filePath),
      'components/Chat',
      'ios'
    );
    const realFile = fs.realpathSync(path.join(root, 'src/components/Chat.js'));
    fs.rmSync(root, { recursive: true, force: true });

    expect(oldShimContent).toContain('require("components/Chat")');
    expect(fromImporter.filePath).toContain(path.join('.cache', 'sherlo', 'mocks'));
    expect(fromTheStandIn.filePath).toBe(realFile);
  });

  it('HAZARD, before the stand-in was lazy: a module in the real file import cycle got the stand-in before it had any export', () => {
    const app = setup();
    const unmocked = app.withoutMocks('src/App.js');
    const mockedEager = app.withMocks('src/App.js', true);
    fs.rmSync(app.root, { recursive: true, force: true });

    expect(unmocked).toBe('ok');
    expect(mockedEager).toBe('stranded');
  });

  it('a module in the real file import cycle sees the same with a mock declared as without', () => {
    const app = setup();
    const unmocked = app.withoutMocks('src/App.js');
    const mocked = app.withMocks('src/App.js');
    fs.rmSync(app.root, { recursive: true, force: true });

    expect(unmocked).toBe('ok');
    expect(mocked).toBe('ok');
  });

  it("the app shell importing { ChatProvider } from a barrel whose provider's import imports the barrel: the eager stand-in strands it, the lazy one does not", () => {
    const app = setup();
    const unmocked = app.withoutMocks('src/Shell.js');
    const mocked = app.withMocks('src/Shell.js');
    const eagerApp = setup();
    const mockedEager = eagerApp.withMocks('src/Shell.js', true);
    fs.rmSync(app.root, { recursive: true, force: true });
    fs.rmSync(eagerApp.root, { recursive: true, force: true });

    expect(unmocked).toBe('function:function');
    expect(mocked).toBe('function:function');
    // The importer in the cycle read `ChatProvider` off an empty exports object.
    expect(mockedEager).toBe('function:undefined');
  });
});

describe('a real module that throws when it loads, behind a lazy stand-in', () => {
  it('the stand-in exists without loading it; a read the mock does not answer throws an error naming the module and the real error, every time', () => {
    const loadReal = vi.fn((): Record<string, unknown> => {
      throw new Error('boom: native module missing');
    });
    const standIn = createLazyMockable<Record<string, unknown>>('components/Boom', loadReal);

    expect(loadReal).not.toHaveBeenCalled();
    expect(() => standIn.anything).toThrow(
      /"components\/Boom" threw when it loaded: Error: boom: native module missing/
    );
    expect(() => standIn.anything).toThrow(/native module missing/);
    expect(loadReal).toHaveBeenCalledTimes(2);

    let caught: Error & { cause?: Error } = new Error('none');
    try {
      standIn.anything;
    } catch (error) {
      caught = error as Error & { cause?: Error };
    }
    expect(caught.name).toBe('RealModuleThrewError');
    expect(caught.cause?.message).toBe('boom: native module missing');
    expect(caught.stack).toContain('Caused by: Error: boom: native module missing');
  });

  it('a mock that answers the read is served without loading the real module', () => {
    const loadReal = vi.fn((): Record<string, unknown> => {
      throw new Error('boom');
    });
    const standIn = createLazyMockable<Record<string, unknown>>('components/Boom', loadReal);
    activateStoryMocks({ 'components/Boom': { value: 'mocked' } });

    expect(standIn.value).toBe('mocked');
    expect(loadReal).not.toHaveBeenCalled();
    expect(() => standIn.other).toThrow(/"components\/Boom" threw when it loaded/);
  });

  it('a mock factory is handed the real module, which loads then', () => {
    const standIn = createLazyMockable<Record<string, unknown>>('pkg/f', () => ({ a: 1 }));
    activateStoryMocks({
      'pkg/f': (real: Record<string, unknown>) => ({ a: (real.a as number) + 1 }),
    });

    expect(standIn.a).toBe(2);
  });
});
