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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parsedOrNull } = require('../../metro/babelParser.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { walkNodes } = require('../../metro/mockScan.js');

afterEach(forgetTheRecorder);

// A module object as a native side may lay one: each member fixed, its methods writable, so the
// engine holds none of them to its value.
function fixedModule(calls: unknown[][]) {
  const module = {};
  Object.defineProperty(module, 'name', { value: 'Lamp', enumerable: true });
  Object.defineProperty(module, 'version', { value: 3, enumerable: true });
  ['start', 'stop'].forEach((method) => {
    const run = nativeFunction(() => calls.push([method]));
    Object.defineProperty(module, method, { value: run, enumerable: true, writable: true });
  });
  return module;
}

// A global laid as a native side lays one the app cannot replace: read-only and non-configurable,
// its module table a member laid the same way, each call of a module's method written down.
function lockedCore(modulesByName: Record<string, object> = {}) {
  const calls: unknown[][] = [];
  const greeter = {
    greet: nativeFunction((name: string) => {
      calls.push(['greet', name]);
      return `Hello ${name}`;
    }),
  };
  const byName: Record<string, object> = {
    Greeter: greeter,
    Lamp: fixedModule(calls),
    ...modulesByName,
  };
  const modules = new Proxy(Object.create(null), {
    get: (_target, key) => byName[key as string],
    has: (_target, key) => key in byName,
    ownKeys: () => Object.keys(byName),
    getOwnPropertyDescriptor: (_target, key) =>
      key in byName
        ? { value: byName[key as string], enumerable: true, configurable: true, writable: false }
        : undefined,
  });
  const core = {};
  Object.defineProperty(core, 'uuid', { value: nativeFunction(() => 'id'), enumerable: true });
  Object.defineProperty(core, 'modules', { value: modules, enumerable: true });
  return { core, calls };
}

// One file of the app run as the bundle runs it, where `global` and `globalThis` are the app's
// global object and the recorder's read, named by itself, is a global like any other unless
// `readByName` is given in its place.
function runAppFile(
  app: Pick<App, 'fakeGlobal'>,
  source: string,
  readByName: unknown = app.fakeGlobal.__sherloGlobalRead
): any {
  const module = { exports: {} as any };
  // eslint-disable-next-line no-new-func
  new Function('global', 'globalThis', '__sherloGlobalRead', 'module', source)(
    app.fakeGlobal,
    app.fakeGlobal,
    readByName,
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
  'var { name, ...lamp } = globalThis.appCore.modules.Lamp;',
  'module.exports.lamp = [name, Object.keys(lamp), lamp.version, lamp.stop()];',
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
    expect(routed).toContain('\nvoid 0, (globalThis != null');
    const app = startAppIn('default', 'new', { b: 1, core: { go: () => 'gone' } });
    expect(() => runAppFile(app, `var b = 1;\n${routed}`)).not.toThrow();
  });
});

// A module object whose methods the engine holds to their values, so a stand-in of it stands on a
// ground of the recorder's own; `more` lays the rest.
function moduleWithHeldMethod(more: (module: Record<PropertyKey, unknown>) => void = () => {}) {
  const module: Record<PropertyKey, unknown> = {};
  Object.defineProperty(module, 'go', { value: nativeFunction(() => 'went'), enumerable: true });
  more(module);
  return module;
}

const frozenWithTag = () =>
  Object.freeze({ go: nativeFunction(() => 'went'), [Symbol.for('tag')]: 'tagged' });

// One case for each answer the engine checks a stand-in by: a module object laid so a stand-in
// that answers other than its ground allows is refused, and what a file does with it.
const RULES_OF_THE_ENGINE: Array<[string, () => object, string]> = [
  [
    'the description of a member',
    frozenWithTag,
    "var tag = Object.getOwnPropertyDescriptor(m, Symbol.for('tag'));\nout.value = [tag.value, tag.configurable, tag.writable];",
  ],
  [
    'the names of its members',
    frozenWithTag,
    'var { go, ...rest } = m;\nout.value = Reflect.ownKeys(rest).map(String);',
  ],
  [
    'whether it has a member',
    () => {
      const module: Record<string, unknown> = { temp: 1 };
      module.drop = nativeFunction(() => delete module.temp);
      return Object.preventExtensions(module);
    },
    "m.drop();\nout.value = ['temp' in m, Object.keys(m), Object.getOwnPropertyDescriptor(m, 'temp')];",
  ],
  [
    'the value of a member',
    () => moduleWithHeldMethod(),
    "var mark = Symbol.for('mark');\nObject.defineProperty(m, mark, { value: m.go });\nout.value = [m[mark] === m.go, m[mark]()];",
  ],
  [
    'a member the file fixed',
    () => moduleWithHeldMethod(),
    "var tag = { go: m.go };\nObject.defineProperty(m, 'tag', { value: tag });\nout.value = [m.tag === tag, m.tag.go(), Object.getOwnPropertyDescriptor(m, 'tag').value === tag];",
  ],
  [
    'how a member is held',
    () =>
      moduleWithHeldMethod((module) => {
        Object.defineProperty(module, 'size', { value: 1, writable: true, enumerable: true });
      }),
    "var held = Object.getOwnPropertyDescriptor(m, 'size');\nif (held.configurable) Object.defineProperty(m, 'size', { value: 2 });\nm.size = 3;\nout.value = [held.configurable, held.writable, m.size, Object.getOwnPropertyDescriptor(m, 'size')];",
  ],
  [
    'whether a method can be built with new',
    () => moduleWithHeldMethod(),
    'var builds = true;\ntry {\n  Reflect.construct(Object, [], m.go);\n} catch (e) {\n  builds = false;\n}\nout.value = builds;',
  ],
  [
    'its prototype',
    () => moduleWithHeldMethod(),
    "var proto = { kind: 'p' };\nObject.setPrototypeOf(m, proto);\nout.value = [Object.getPrototypeOf(m) === proto, m.kind];",
  ],
  [
    'whether it takes new members',
    () =>
      moduleWithHeldMethod((module) => {
        module.size = 1;
        module.close = nativeFunction(() => {
          Object.preventExtensions(module);
        });
      }),
    'm.close();\nout.value = [Object.isExtensible(m), Object.isSealed(m), Object.keys(m)];',
  ],
];

// The names a file reads by themselves: a member's own name, after a dot, is not one.
function namesReadAlone(source: string): Set<string> {
  const members = new Set<unknown>();
  const names = new Set<string>();
  walkNodes(parsedOrNull(source, { sourceType: 'unambiguous' }).program, (node: any) => {
    if (/MemberExpression$/.test(node.type) && !node.computed) members.add(node.property);
    if (node.type === 'Identifier' && !members.has(node)) names.add(node.name);
  });
  return names;
}

// The file run on another JS runtime, whose global object has no recorder: a compiler that moved
// the file there took along any name the file read by itself, the recorder's read among them,
// which throws when called there.
function runElsewhere(source: string) {
  const native = lockedCore();
  const otherGlobal: Record<string, any> = {};
  Object.defineProperty(otherGlobal, 'appCore', { value: native.core, enumerable: true });
  const takenAlong = () => {
    throw new Error('a function of another runtime was called');
  };
  const exported = runAppFile({ fakeGlobal: otherGlobal }, source, takenAlong);
  return { exports: exported, calls: native.calls };
}

describe('a rewritten file keeps the app starting and drawing as written', () => {
  it.each(RULES_OF_THE_ENGINE)(
    'a stand-in keeps the engine rule on %s, and the file reads the same as written',
    (_rule, layModule, reader) => {
      const source = `var m = globalThis.appCore.modules.Mod;\nvar out = module.exports;\n${reader}`;
      const runIn = (file: string) => {
        const native = lockedCore({ Mod: layModule() });
        const app = startAppIn('testing', 'new', {}, { readOnly: { appCore: native.core } });
        return runAppFile(app, file);
      };
      const asWritten = runIn(source);
      expect(() => runIn(route(source))).not.toThrow();
      expect(runIn(route(source))).toEqual(asWritten);
    }
  );

  it('the rewritten file reads no name by itself that the file as written did not', () => {
    const source = `${READER}\nmodule.exports.other = global['appCore'] && global?.appCore.uuid;`;
    const added = [...namesReadAlone(route(source))].filter(
      (name) => !namesReadAlone(source).has(name)
    );
    expect(route(source)).not.toBe(source);
    expect(added).toEqual([]);
  });

  it('on a runtime with no recorder a rewritten file gives the same answers as written', () => {
    expect(runElsewhere(route(READER))).toEqual(runElsewhere(READER));
  });

  it('a file that binds a name of the global object as its own reads it as written', () => {
    // An object of the file's own that refuses a read of a member it lacks, as some objects do.
    const strict =
      'var strict = new Proxy({ x: 1 }, {\n  get: function (target, key) {\n    if (!(key in target)) throw new Error("no " + String(key));\n    return target[key];\n  },\n});\n';
    const sources = [
      'function read(global) {\n  return global.x;\n}\nmodule.exports.x = read(strict);',
      'var { globalThis } = { globalThis: strict };\nmodule.exports.x = globalThis.x;',
      'try {\n  throw strict;\n} catch (global) {\n  module.exports.x = global.x;\n}',
    ].map((reader) => strict + reader);
    sources.forEach((source) => {
      const app = startAppIn('testing', 'new');
      expect(runAppFile(app, route(source))).toEqual({ x: 1 });
      expect(route(source)).toBe(source);
    });
  });
});
