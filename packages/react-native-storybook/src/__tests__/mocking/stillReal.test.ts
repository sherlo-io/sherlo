/**
 * SPIKE still-real-on-hermes: the recording stand-in on every app module, installed only in
 * testing mode; the bundler's list of app modules; the log line per story.
 */
import * as fs from 'fs';
import * as path from 'path';

const { runLog } = vi.hoisted(() => ({ runLog: vi.fn() }));
vi.mock('../../helpers/RunnerBridge/actions/log', () => ({ default: runLog }));

import {
  logStillRealOfStory,
  resetStillRealForTests,
  startStillRealStory,
} from '../../mocking/stillReal';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const stillRealBundler = require('../../../metro/stillReal.js');

const polyfillSource = fs.readFileSync(path.join(__dirname, '../../../metro/polyfill.js'), 'utf8');

function runPolyfillIn(mode: string, paths?: Record<string, string>) {
  const fakeGlobal: Record<string, any> = {
    __turboModuleProxy: (name: string) =>
      name === 'SherloModule' ? { getSherloConstants: () => ({ mode }) } : null,
    __d: vi.fn(),
    __sherloStillRealPaths: paths,
  };
  // eslint-disable-next-line no-new-func
  new Function('global', `"use strict";\n${polyfillSource}`)(fakeGlobal);
  return fakeGlobal;
}

describe('the recording stand-in in the polyfill', () => {
  function evaluateModule(mode: string, exportsObject: any, paths: Record<string, string>) {
    const original = vi.fn();
    const fakeGlobal: Record<string, any> = {
      __turboModuleProxy: (name: string) =>
        name === 'SherloModule' ? { getSherloConstants: () => ({ mode }) } : null,
      __d: original,
      __sherloStillRealPaths: paths,
    };
    // eslint-disable-next-line no-new-func
    new Function('global', `"use strict";\n${polyfillSource}`)(fakeGlobal);
    if (mode === 'default' || mode === 'storybook') return { fakeGlobal, original, module: null };
    fakeGlobal.__d(
      (_g: unknown, _r: unknown, _i: unknown, _a: unknown, mod: any) => {
        mod.exports = exportsObject;
      },
      7,
      []
    );
    const module: any = { exports: {} };
    original.mock.calls[0][0].call(
      undefined,
      fakeGlobal,
      null,
      null,
      null,
      module,
      module.exports,
      []
    );
    return { fakeGlobal, original, module };
  }

  it('watches a listed module in testing mode and notes the exports read', () => {
    const real = { sendMessage: () => 1, other: () => 2 };
    const { fakeGlobal, module } = evaluateModule('testing', real, { '7': './src/chat.ts' });

    fakeGlobal.__sherloStillReal.startStory();
    expect(module.exports.sendMessage()).toBe(1);
    expect(module.exports.sendMessage).toBe(real.sendMessage);

    expect(fakeGlobal.__sherloStillReal.readStory()).toEqual([
      { module: './src/chat.ts', exports: ['sendMessage'] },
    ]);
    expect(fakeGlobal.__sherloStillReal.watchedCount).toBe(1);
  });

  it('forgets what was read when the next story starts', () => {
    const { fakeGlobal, module } = evaluateModule('testing', { a: 1 }, { '7': './src/a.ts' });
    expect(module.exports.a).toBe(1);
    fakeGlobal.__sherloStillReal.startStory();
    expect(fakeGlobal.__sherloStillReal.readStory()).toEqual([]);
  });

  it('leaves a module the bundler did not list as it was', () => {
    const real = { a: 1 };
    const { module } = evaluateModule('testing', real, { '99': './src/other.ts' });
    expect(module.exports).toBe(real);
  });

  it('does nothing in storybook and default mode: no watcher is made', () => {
    expect(runPolyfillIn('storybook', { '7': './x.ts' }).__sherloStillReal).toBeUndefined();
    expect(runPolyfillIn('default', { '7': './x.ts' }).__sherloStillReal).toBeUndefined();
  });

  it('returns a frozen module value unchanged under the Proxy rules, and notes a called export', () => {
    const frozen = Object.freeze({ value: { nested: 1 } });
    const { module } = evaluateModule('testing', frozen, { '7': './src/frozen.ts' });
    expect(module.exports.value).toBe(frozen.value);

    const fn = Object.assign(() => 'called', { extra: 1 });
    const second = evaluateModule('testing', fn, { '7': './src/fn.ts' });
    expect(second.module.exports()).toBe('called');
    expect(second.fakeGlobal.__sherloStillReal.readStory()).toEqual([
      { module: './src/fn.ts', exports: ['(call)'] },
    ]);
  });
});

describe('the bundler list', () => {
  const create = (() => {
    let next = 0;
    const ids = new Map<string, number>();
    return (p: string) => ids.get(p) ?? (ids.set(p, (next += 1)), next);
  })();

  it("lists the project's own modules and leaves out node_modules, stories and Sherlo's own", () => {
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
    expect(Object.values(paths)).toEqual(['./src/chat/client.ts']);
  });

  it('adds one script before the modules, and none with SHERLO_STILL_REAL=off', () => {
    const delegate = vi.fn(() => 'bundle');
    const graph = { dependencies: new Map([['/app/src/a.ts', {}]]) };
    const options = { createModuleId: create, projectRoot: '/app' };

    stillRealBundler.withStillRealList(delegate, '/app', {})('entry', [], graph, options);
    const withList = (delegate.mock.calls[0] as any[])[1];
    expect(withList).toHaveLength(1);
    expect(withList[0].output[0].data.code).toContain('__sherloStillRealPaths');

    delegate.mockClear();
    stillRealBundler.withStillRealList(delegate, '/app', { SHERLO_STILL_REAL: 'off' })(
      'entry',
      [],
      graph,
      options
    );
    expect((delegate.mock.calls[0] as any[])[1]).toEqual([]);
  });
});

describe('the bundler config', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const applySherloTransforms = require('../../../metro/applySherloTransforms');
  const configFor = (enabled: boolean, env?: string) => {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sherlo-still-real-'));
    if (env) process.env.SHERLO_STILL_REAL = env;
    try {
      return applySherloTransforms({ projectRoot: tmpDir, resolver: {} }, { enabled });
    } finally {
      delete process.env.SHERLO_STILL_REAL;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };

  it('carries the list serializer by default, and not when watching is off or Sherlo is disabled', () => {
    expect(typeof configFor(true).serializer.customSerializer).toBe('function');
    expect(configFor(true, 'off').serializer.customSerializer).toBeUndefined();
    expect(configFor(false).serializer.customSerializer).toBeUndefined();
  });
});

describe('the log line per story', () => {
  beforeEach(() => {
    runLog.mockClear();
    resetStillRealForTests();
    delete (globalThis as any).__sherloStillReal;
  });
  afterEach(() => {
    delete (globalThis as any).__sherloStillReal;
  });

  it('writes nothing when nothing watches (Storybook mode, a store build)', () => {
    startStillRealStory();
    logStillRealOfStory('a--b', []);
    expect(runLog).not.toHaveBeenCalled();
  });

  it('writes the watching line once and one prefixed line per story', () => {
    const fake = runPolyfillIn('testing', { '7': './src/chat.ts' });
    (globalThis as any).__sherloStillReal = fake.__sherloStillReal;

    startStillRealStory();
    startStillRealStory();
    logStillRealOfStory('chat--default', [
      {
        method: 'POST',
        url: 'https://x/graphql',
        operationName: 'Chats',
        answered: 'refused',
        count: 2,
      } as any,
    ]);

    const lines = runLog.mock.calls.map((call) => call[0] as string);
    expect(
      lines.filter((line) => line.includes('not watching') || line.includes('watching'))
    ).toHaveLength(1);
    expect(lines[1]).toBe('[Sherlo still-real] story chat--default');
    expect(runLog.mock.calls[1][1]).toMatchObject({
      modules: [],
      unanswered: [{ operationName: 'Chats' }],
    });
  });
});
