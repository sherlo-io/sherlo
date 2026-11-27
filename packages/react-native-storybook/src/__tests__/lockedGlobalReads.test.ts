/**
 * The app's reads of a global's members, routed through the recorder at transform time
 * (metro/lockedGlobalReads.js) and answered by it (metro/polyfill.js): a read below a global native
 * code laid so the app cannot replace it is recorded as any native use, and nothing the app gets
 * changes.
 */
import { startStoryRecording, storyRecordingOf } from '../nativeRecording';

import { type App, forgetTheRecorder, nativeFunction, startAppIn } from './recordingApp';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { routeGlobalReads } = require('../../metro/lockedGlobalReads.js');

afterEach(forgetTheRecorder);

// A global laid as a native side lays one the app cannot replace: read-only and non-configurable,
// its module table a member laid the same way, each call of a module's method written down.
function lockedCore() {
  const calls: unknown[][] = [];
  const greeter = {
    greet: nativeFunction((name: string) => {
      calls.push(['greet', name]);
      return `Hello ${name}`;
    }),
  };
  const modules = new Proxy(Object.create(null), {
    get: (_target, key) => (key === 'Greeter' ? greeter : undefined),
    has: (_target, key) => key === 'Greeter',
    ownKeys: () => ['Greeter'],
    getOwnPropertyDescriptor: (_target, key) =>
      key === 'Greeter'
        ? { value: greeter, enumerable: true, configurable: true, writable: false }
        : undefined,
  });
  const core = {};
  Object.defineProperty(core, 'uuid', { value: nativeFunction(() => 'id'), enumerable: true });
  Object.defineProperty(core, 'modules', { value: modules, enumerable: true });
  return { core, calls };
}

// One file of the app run as the bundle runs it, where `global` and `globalThis` are the app's
// global object and the recorder's read is a global like any other.
function runAppFile(app: App, source: string): any {
  const module = { exports: {} as any };
  // eslint-disable-next-line no-new-func
  new Function('global', 'globalThis', '__sherloGlobalRead', 'module', source)(
    app.fakeGlobal,
    app.fakeGlobal,
    app.fakeGlobal.__sherloGlobalRead,
    module
  );
  return module.exports;
}

const route = (source: string) => routeGlobalReads('app/reader.js', source);

const READER = [
  "var greeter = globalThis.appCore.modules['Greeter'];",
  "module.exports.text = greeter.greet('Ann');",
  "module.exports.again = global?.appCore?.modules.Greeter.greet('Bo');",
  "module.exports.known = 'Greeter' in globalThis.appCore.modules;",
  'module.exports.kind = typeof globalThis.appCore;',
].join('\n');

describe('reads below a global the app cannot replace', () => {
  it('a module reading a member of a locked global has that read, and what came back, in the recording', () => {
    const native = lockedCore();
    const app = startAppIn('testing', 'new', {}, { readOnly: { appCore: native.core } });

    const exported = runAppFile(app, route(READER));
    startStoryRecording('reader--first');

    const calls = storyRecordingOf('reader--first')?.nativeCalls ?? [];
    const read = calls.find(({ module, method }) => module === 'appCore' && method === 'get');
    expect(read).toMatchObject({ args: ['modules'], kind: 'sync' });
    const modulesHandle = (read?.answer as { handle: string }).handle;
    expect(read?.answer).toEqual({ $: 'native', handle: modulesHandle, type: 'object' });
    expect(calls).toContainEqual(
      expect.objectContaining({ module: modulesHandle, method: 'get', args: ['Greeter'] })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'apply',
        args: [expect.anything(), ['Ann']],
        answer: 'Hello Ann',
      })
    );
    expect(exported.text).toBe('Hello Ann');
  });

  it('a global that is not locked keeps its real value and identity', () => {
    const plain = { count: 1 };
    const app = startAppIn('testing', 'new', { plainThing: plain });

    const exported = runAppFile(
      app,
      route(
        'module.exports.plain = globalThis.plainThing;\nmodule.exports.missing = global.nothing;'
      )
    );

    expect(exported.plain).toBe(plain);
    expect(exported.missing).toBeUndefined();
  });

  it('a rewritten file draws the same as the file as written: the same calls reach the locked global and the same answers come back', () => {
    const asWrittenNative = lockedCore();
    const asWritten = runAppFile(
      startAppIn('testing', 'new', {}, { readOnly: { appCore: asWrittenNative.core } }),
      READER
    );
    const routedNative = lockedCore();
    const routed = runAppFile(
      startAppIn('testing', 'new', {}, { readOnly: { appCore: routedNative.core } }),
      route(READER)
    );
    // Outside a test run there is no recorder, and the read runs as it was written.
    const offNative = lockedCore();
    const offApp = startAppIn('default', 'new', {}, { readOnly: { appCore: offNative.core } });
    const off = runAppFile(offApp, route(READER));

    expect(routed).toEqual(asWritten);
    expect(off).toEqual(asWritten);
    expect(routedNative.calls).toEqual(asWrittenNative.calls);
    expect(offNative.calls).toEqual(asWrittenNative.calls);
  });

  it('a file naming no read of a global member is left byte for byte as it was', () => {
    const source = 'const g = globals.x;\nmyglobal.y = globalThisLike.z;\n';
    expect(route(source)).toBe(source);
    expect(routeGlobalReads('app/data.json', '{"global.x": 1}')).toBe('{"global.x": 1}');
    expect(routeGlobalReads('app/broken.js', 'global.x = (')).toBe('global.x = (');
  });

  it('a write, a delete, a method call and a chain a nullish global would end are left as written', () => {
    const source = [
      'global.a = 1;',
      'delete globalThis.b;',
      'globalThis.c++;',
      '[global.d] = [2];',
      "globalThis.fetch('x');",
      'globalThis?.e.f;',
      'global.__sherloOwn;',
      'for (global.g in {});',
      'for (globalThis.h of []);',
      '[global.i = 1] = [];',
      '[...global.j] = [];',
      '({ k: global.k } = {});',
      '({ ...globalThis.l } = {});',
      'globalThis.m?.();',
      'global.n`x`;',
    ].join('\n');
    expect(route(source)).toBe(source);
  });

  it('a statement that begins with a routed read keeps its line from joining the one before', () => {
    const routed = route('var a = b\nglobalThis.core.go()\n');
    expect(routed).toContain('\nvoid 0, (typeof __sherloGlobalRead');
    const app = startAppIn('default', 'new', { b: 1, core: { go: () => 'gone' } });
    expect(() => runAppFile(app, `var b = 1;\n${routed}`)).not.toThrow();
  });
});
