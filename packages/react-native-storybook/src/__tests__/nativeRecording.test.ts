/**
 * The app records what each story asked of native, for the quick check to replay: the polyfill's
 * recorder (metro/polyfill.js), the lines the transformer adds to the files that reach native
 * (metro/mockSpecifierTransformer.js) and what the SDK reads of it per story (../nativeRecording).
 *
 * The shape of each entry, as the recorder's head comment gives it in full: a module lookup is
 * { module: '__turboModuleProxy' | 'nativeModuleProxy', method: 'lookup', args: [name], answer:
 * { $: 'module' } | null }, each time; a global native code installed is { module: 'global',
 * method: 'installed', args: [name], answer: { $: 'native', handle: name, type } }, and one holding
 * data as the bundle began the same with the data as its answer; each use of a
 * native value is { module: <its handle>, method: <the operation: get, has, apply, construct...>,
 * args, answer }, a native value in it { $: 'native', handle: '#n', type }; a callback native
 * calls, a promise that settles and a call native makes into a callable module (a device event)
 * come as kind 'async', under the callback's or promise's handle or 'callable:<name>'.
 */
import * as fs from 'fs';
import * as path from 'path';

import { rememberStoryOfTheApp } from '../componentNames';
import { MESSAGE_EVENT } from '../connection/appLine';
import { UNANSWERED_EVENT } from '../mocking/networkNative';
import { startStoryRecording, storyRecordingOf } from '../nativeRecording';

import {
  CALLABLE_MODULES,
  callableModulesSource,
  DEVICE_EVENT_EMITTER,
  deviceEventEmitterSource,
  FABRIC_RENDERER,
  NATIVE_MODULES,
  nativeModulesSource,
  registrySource,
  rendererSource,
  TURBO_MODULE_REGISTRY,
} from './nativeRoadFiles';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markNativeRoads } = require('../../metro/mockSpecifierTransformer.js');

const polyfillSource = fs.readFileSync(path.join(__dirname, '../../metro/polyfill.js'), 'utf8');

// The globals of the test's app on the new architecture as its JavaScript begins.
const GLOBALS_OF_A_NEW_APP = [
  '__turboModuleProxy',
  '__d',
  'eventsReactRan',
  'nativeModulesOfTheTest',
  'nativeFabricUIManager',
];
// Of them, a function of the bundle's own source, never named as unseen...
const MADE_BY_THE_BUNDLE = ['__d'];
// ...and the ones holding data, recorded as their values (an empty list and an empty object).
const DATA_AT_START = ['eventsReactRan', 'nativeModulesOfTheTest'];
// As each story's recording holds them, ahead of everything else: the data as its values, then,
// once every start global is through, the bundle's own listed for the quick check to find.
const DATA_ENTRIES_AT_START = [
  ['global', 'installed', ['eventsReactRan'], []],
  ['global', 'installed', ['nativeModulesOfTheTest'], {}],
];
// The list comes after an app's own native globals too, as they are start globals as well. Each
// name carries what it is, for the quick check to tell its own global of that name from the
// phone's: the bundle's is a function of JavaScript source (the test's mock).
const BUNDLE_KINDS = { __d: { type: 'function', native: false, name: 'Mock', length: 0 } };
const LIST_ENTRY_AT_START = ['global', 'notFromThePhone', MADE_BY_THE_BUNDLE, BUNDLE_KINDS];
const ENTRIES_AT_START = [...DATA_ENTRIES_AT_START, LIST_ENTRY_AT_START];
// The same entries in full, in their places in an app with no globals of its own: the data after
// `__turboModuleProxy`, the list after every start global the bundle did not make.
const ORDERS_AT_START = [1, 2, GLOBALS_OF_A_NEW_APP.length - MADE_BY_THE_BUNDLE.length];
const CALLS_AT_START = ENTRIES_AT_START.map(([module, method, args, answer], index) => ({
  module,
  method,
  args,
  kind: 'sync',
  answer,
  order: ORDERS_AT_START[index],
  afterPicture: false,
}));
// The same entries as [module, method, args, kind].
const KINDS_AT_START = CALLS_AT_START.map(({ module, method, args, kind }) => [
  module,
  method,
  args,
  kind,
]);

// The globals the bundle began with, `names` in the order the app has them, handed over with every
// story ahead of the rest; the bundle's own take no place, and the native ones `recorded` and the
// ones holding data take their place in the order as recorded.
function globalsAtStart(names: string[], recorded: string[] = []) {
  return names
    .filter((name) => !MADE_BY_THE_BUNDLE.includes(name))
    .map((name, order) => ({ kind: 'jsiGlobal', name: `atStart:${name}`, order }))
    .filter(({ name }) => {
      const globalName = name.slice('atStart:'.length);
      return !recorded.includes(globalName) && !DATA_AT_START.includes(globalName);
    });
}

// A function as native code makes it: the engine does not show its source.
function nativeFunction<T extends object>(implementation: T): T {
  return new Proxy(implementation, {});
}

type App = {
  fakeGlobal: Record<string, any>;
  dispatch: (...args: unknown[]) => void;
  // The bundle registering a module native code may call into, and that module as native has it.
  registerCallableModule: (name: string, module: object) => void;
  callableModule: (name: string) => any;
};

// The polyfill run as the app's JavaScript starts in `mode`; the new architecture carries Fabric's
// UI manager, the old one does not. `readOnly` globals are installed as native code installs a
// global the app cannot replace, `notEnumerated` ones as a native side installs a global it does
// not enumerate; the registration of callable modules runs unless left out.
function startAppIn(
  mode: string,
  architecture: 'new' | 'old',
  extras: Record<string, any> = {},
  options: {
    readOnly?: Record<string, unknown>;
    notEnumerated?: Record<string, unknown>;
    engine?: Record<string, unknown>;
    withoutCallableRoad?: boolean;
  } = {}
) {
  const app: App = {
    fakeGlobal: {},
    dispatch: () => undefined,
    registerCallableModule: () => undefined,
    callableModule: () => undefined,
  };
  // The engine's own, as the language lays them on the global object as the engine starts, before
  // anything else is there: never enumerable.
  Object.entries(options.engine ?? {}).forEach(([name, value]) => {
    Object.defineProperty(app.fakeGlobal, name, { value, enumerable: false, writable: false });
  });
  Object.assign(app.fakeGlobal, {
    __turboModuleProxy: (name: string) =>
      app.fakeGlobal.nativeModulesOfTheTest[name] ??
      (name === 'SherloModule' ? { getSherloConstants: () => ({ mode }) } : null),
    __d: vi.fn(),
    eventsReactRan: [],
    nativeModulesOfTheTest: {},
    ...extras,
  });
  Object.entries(options.readOnly ?? {}).forEach(([name, value]) => {
    Object.defineProperty(app.fakeGlobal, name, { value, enumerable: true, writable: false });
  });
  Object.entries(options.notEnumerated ?? {}).forEach(([name, value]) => {
    Object.defineProperty(app.fakeGlobal, name, {
      value,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  });
  if (architecture === 'new') {
    app.fakeGlobal.nativeFabricUIManager = {
      completeRoot: vi.fn(),
      registerEventHandler: (handler: App['dispatch']) => {
        app.dispatch = handler;
      },
    };
  }
  // eslint-disable-next-line no-new-func
  new Function('global', `"use strict";\n${polyfillSource}`)(app.fakeGlobal);
  (globalThis as { __sherloNativeRecorder?: unknown }).__sherloNativeRecorder =
    app.fakeGlobal.__sherloNativeRecorder;
  if (!options.withoutCallableRoad) {
    const callables = runFile(app, CALLABLE_MODULES, callableModulesSource);
    app.registerCallableModule = callables.default;
    app.callableModule = (name) => callables.registered[name]();
  }
  return app;
}

// Runs one file of the app as the bundle would, after the transformer marked it.
function runFile(app: App, filename: string, source: string): any {
  const module = { exports: {} as any };
  // eslint-disable-next-line no-new-func
  new Function('global', 'module', markNativeRoads(filename, source))(app.fakeGlobal, module);
  return module.exports;
}

// The native object native code lays as the global `coreBridge` in a run of its own.
function bridgeLaidByNative() {
  const laid = Object.create(null);
  laid.Emitter = nativeFunction(function Emitter() {});
  return laid;
}

// The bundle reads a member of `coreBridge` at load, then the story starts: what it recorded last,
// each call as [module, method, args], once `coreBridge` is checked to be no blind road of it.
function lastCallsAfterBridgeRead(app: App, storyId: string, count: number) {
  expect(typeof app.fakeGlobal.coreBridge.Emitter).toBe('function');
  startStoryRecording(storyId);
  const recording = storyRecordingOf(storyId);
  expect(recording?.blindRoads).not.toContainEqual(
    expect.objectContaining({ kind: 'jsiGlobal', name: 'coreBridge' })
  );
  return recording?.nativeCalls
    .map(({ module, method, args }) => [module, method, args])
    .slice(-count);
}

afterEach(() => {
  delete (globalThis as { __sherloNativeRecorder?: unknown }).__sherloNativeRecorder;
  rememberStoryOfTheApp(undefined);
});

describe('what the app records for each story', () => {
  it('a test run records every native module call with its answer for each story and device setup', async () => {
    const app = startAppIn('testing', 'new');
    let answerTheCallback: (value: string) => void = () => undefined;
    app.fakeGlobal.nativeModulesOfTheTest = {
      SherloModule: { getMode: () => 'testing' },
      Clipboard: {
        getString: () => 'copied',
        hasStrings: (_onAnswer: (value: string) => void) => {
          answerTheCallback = _onAnswer;
        },
        getImage: () => Promise.resolve({ width: 2 }),
        setString: () => {
          throw new Error('no clipboard');
        },
      },
    };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);

    startStoryRecording('buttons--primary');
    registry.getEnforcing('SherloModule').getMode();
    const clipboard = registry.get('Clipboard');
    expect(clipboard.getString('plain')).toBe('copied');
    clipboard.hasStrings((value: string) => value);
    answerTheCallback('yes');
    await expect(clipboard.getImage()).resolves.toEqual({ width: 2 });
    expect(() => clipboard.setString(undefined)).toThrow('no clipboard');
    expect(registry.get('Missing')).toBeNull();

    // Sherlo's own module is the SDK talking, not the story: neither its lookup nor its calls.
    expect(storyRecordingOf('buttons--primary')?.nativeCalls).toEqual([
      ...CALLS_AT_START,
      {
        module: '__turboModuleProxy',
        method: 'lookup',
        args: ['Clipboard'],
        kind: 'sync',
        answer: { $: 'module' },
        order: 5,
        afterPicture: false,
      },
      {
        module: 'Clipboard',
        method: 'getString',
        args: ['plain'],
        kind: 'sync',
        answer: 'copied',
        order: 6,
        afterPicture: false,
      },
      {
        module: 'Clipboard',
        method: 'hasStrings',
        args: [{ $unserialisable: 'function' }],
        kind: 'async',
        answer: { $: 'undefined' },
        callbacks: [{ arg: 0, args: ['yes'] }],
        order: 7,
        afterPicture: false,
      },
      {
        module: 'Clipboard',
        method: 'getImage',
        args: [],
        kind: 'async',
        answer: { width: 2 },
        order: 8,
        afterPicture: false,
      },
      {
        module: 'Clipboard',
        method: 'setString',
        args: [{ $: 'undefined' }],
        kind: 'sync',
        threw: { $: 'error', name: 'Error', message: 'no clipboard', code: null },
        order: 9,
        afterPicture: false,
      },
      {
        module: '__turboModuleProxy',
        method: 'lookup',
        args: ['Missing'],
        kind: 'sync',
        answer: null,
        order: 10,
        afterPicture: false,
      },
    ]);

    // The next story keeps its own calls; the first story's stay as they were.
    startStoryRecording('buttons--secondary');
    registry.get('Clipboard').getString('rich');
    expect(
      storyRecordingOf('buttons--secondary')?.nativeCalls.map(({ module, method }) => [
        module,
        method,
      ])
    ).toEqual([
      ...ENTRIES_AT_START.map(([module, method]) => [module, method]),
      ['__turboModuleProxy', 'lookup'],
      ['Clipboard', 'getString'],
    ]);
    expect(storyRecordingOf('buttons--primary')?.nativeCalls).toHaveLength(9);

    // Each device setup is its own launch, with a recording of its own.
    const darkApp = startAppIn('testing', 'new');
    darkApp.fakeGlobal.nativeModulesOfTheTest = { Clipboard: { getString: () => 'dark' } };
    startStoryRecording('buttons--primary');
    runFile(darkApp, TURBO_MODULE_REGISTRY, registrySource).get('Clipboard').getString();
    expect(storyRecordingOf('buttons--primary')?.nativeCalls.map(({ answer }) => answer)).toEqual([
      ...ENTRIES_AT_START.map(([, , , answer]) => answer),
      { $: 'module' },
      'dark',
    ]);
  });

  it("a test run records every event a native view sent, each view's place, the commit points and the picture moment", () => {
    const app = startAppIn('testing', 'new');
    const markedRenderer = markNativeRoads(FABRIC_RENDERER, rendererSource);
    expect(markedRenderer.split('\n')).toHaveLength(rendererSource.split('\n').length);
    const renderer = runFile(app, FABRIC_RENDERER, rendererSource);
    app.fakeGlobal.nativeModulesOfTheTest = { Haptics: { impact: () => true } };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);

    const story = { index: 0, return: null };
    const card = { index: 2, return: story };
    const list = {
      index: 1,
      return: card,
      type: 'RCTScrollView',
      stateNode: { canonical: { viewConfig: { uiViewClassName: 'RCTScrollView' } } },
    };
    const outside = { index: 0, return: null, type: 'RCTView' };
    rememberStoryOfTheApp(story as never);

    startStoryRecording('list--long');
    renderer.commit();
    app.dispatch(list, 'topScroll', { contentOffset: { y: 40 } });
    renderer.commit();
    app.dispatch(outside, 'topLayout', { layout: { width: 3 } });

    const atThePicture = storyRecordingOf('list--long');
    registry.get('Haptics').impact('light');
    const afterThePicture = storyRecordingOf('list--long');

    expect(atThePicture).toEqual({
      storyId: 'list--long',
      nativeCalls: CALLS_AT_START,
      viewEvents: [
        {
          component: 'RCTScrollView',
          event: 'topScroll',
          payload: { contentOffset: { y: 40 } },
          place: [2, 1],
          order: 6,
        },
        {
          component: 'RCTView',
          event: 'topLayout',
          payload: { layout: { width: 3 } },
          place: null,
          order: 8,
        },
      ],
      commits: [5, 7],
      pictureAt: 9,
      blindRoads: globalsAtStart(GLOBALS_OF_A_NEW_APP),
    });
    // React ran every event and native got every commit, as without the recorder.
    expect(app.fakeGlobal.eventsReactRan).toEqual(['topScroll', 'topLayout']);
    expect(app.fakeGlobal.nativeFabricUIManager.completeRoot).toHaveBeenCalledTimes(2);
    // The calls after the picture are kept, marked, and the picture moment stays where it was.
    expect(afterThePicture?.pictureAt).toBe(9);
    expect(
      afterThePicture?.nativeCalls.map(({ method, afterPicture }) => [method, afterPicture])
    ).toEqual([
      ...CALLS_AT_START.map(({ method, afterPicture }) => [method, afterPicture]),
      ['lookup', true],
      ['impact', true],
    ]);
  });

  it('every read of a global installed natively is recorded with its answer', async () => {
    let deliver: (event: string) => void = () => undefined;
    class Recorder {
      constructor(readonly quality: number) {}
      start() {
        return `recording at ${this.quality}`;
      }
    }
    // A library's native half, as native code installs it before the bundle runs.
    const camera = Object.create(null);
    camera.version = '2.1';
    camera.capture = nativeFunction((quality: string) => `photo-${quality}`);
    camera.load = nativeFunction(() => Promise.resolve({ width: 4 }));
    camera.watch = nativeFunction((listener: (event: string) => void) => {
      deliver = listener;
    });
    camera.Recorder = nativeFunction(Recorder);
    // A native call that installs a global of its own as it runs.
    camera.install = nativeFunction(() => {
      const frames = Object.create(null);
      frames.count = 2;
      app.fakeGlobal.cameraFrames = frames;
    });
    const app = startAppIn('testing', 'new', { camera });
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('camera--live');
    const native = app.fakeGlobal.camera;
    expect(native.version).toBe('2.1');
    expect(native.capture('high')).toBe('photo-high');
    await expect(native.load()).resolves.toEqual({ width: 4 });
    const heard: string[] = [];
    native.watch((event: string) => heard.push(event));
    deliver('focus');
    expect(new native.Recorder(3).start()).toBe('recording at 3');
    class LongRecorder extends native.Recorder {}
    expect(new LongRecorder(5).start()).toBe('recording at 5');
    native.mode = 'night';
    native.install();
    expect(app.fakeGlobal.cameraFrames.count).toBe(2);

    const recording = storyRecordingOf('camera--live');
    const atStart = ['__turboModuleProxy', '__d', 'eventsReactRan', 'nativeModulesOfTheTest'];
    expect(recording?.blindRoads).toEqual([
      ...globalsAtStart(atStart),
      { kind: 'jsiGlobal', name: 'atStart:nativeFabricUIManager', order: 4 },
    ]);
    const cameraRef = (handle: string, type = 'function') => ({ $: 'native', handle, type });
    expect(
      recording?.nativeCalls.map(({ module, method, args, kind, answer }) => [
        module,
        method,
        args,
        kind,
        answer,
      ])
    ).toEqual([
      ...DATA_ENTRIES_AT_START.map(([module, method, args, answer]) => [
        module,
        method,
        args,
        'sync',
        answer,
      ]),
      ['global', 'installed', ['camera'], 'sync', cameraRef('camera', 'object')],
      [...LIST_ENTRY_AT_START.slice(0, 3), 'sync', BUNDLE_KINDS],
      ['camera', 'get', ['version'], 'sync', '2.1'],
      ['camera', 'get', ['capture'], 'sync', cameraRef('#1')],
      ['#1', 'apply', [cameraRef('camera', 'object'), ['high']], 'sync', 'photo-high'],
      ['camera', 'get', ['load'], 'sync', cameraRef('#2')],
      ['#2', 'apply', [cameraRef('camera', 'object'), []], 'sync', { $: 'promise', handle: '#3' }],
      ['#3', 'resolve', [{ width: 4 }], 'async', undefined],
      ['camera', 'get', ['watch'], 'sync', cameraRef('#4')],
      [
        '#4',
        'apply',
        [cameraRef('camera', 'object'), [{ $: 'callback', handle: '#5' }]],
        'sync',
        { $: 'undefined' },
      ],
      ['#5', 'apply', [{ $: 'undefined' }, ['focus']], 'async', undefined],
      ['camera', 'get', ['Recorder'], 'sync', cameraRef('#6')],
      ['#6', 'construct', [[3], cameraRef('#6')], 'sync', cameraRef('#7', 'object')],
      ['#7', 'get', ['start'], 'sync', cameraRef('#8')],
      ['#8', 'apply', [cameraRef('#7', 'object'), []], 'sync', 'recording at 3'],
      ['camera', 'get', ['Recorder'], 'sync', cameraRef('#6')],
      // Extending a native class reads its prototype, here an object of plain data.
      ['#6', 'get', ['prototype'], 'sync', {}],
      ['#6', 'construct', [[5], { $: 'subclass' }], 'sync', cameraRef('#9', 'object')],
      ['#9', 'get', ['start'], 'sync', cameraRef('#8')],
      ['#8', 'apply', [cameraRef('#9', 'object'), []], 'sync', 'recording at 5'],
      ['camera', 'set', ['mode', 'night'], 'sync', true],
      ['camera', 'get', ['install'], 'sync', cameraRef('#10')],
      // A call is noted as it starts, so the global it installed comes after it.
      ['#10', 'apply', [cameraRef('camera', 'object'), []], 'sync', { $: 'undefined' }],
      ['global', 'installed', ['cameraFrames'], 'sync', cameraRef('cameraFrames', 'object')],
      ['cameraFrames', 'get', ['count'], 'sync', 2],
    ]);
    expect(heard).toEqual(['focus']);
  });

  it('a native global whose members native holds fixed is recorded with what the bundle reads from it, and native still gets back its own value', () => {
    class Emitter {
      constructor(readonly name: string) {}
      describe() {
        return `emits ${this.name}`;
      }
    }
    // A native half that installs a global before the bundle runs and holds each of its members
    // fixed, neither writable nor configurable; its method refuses any `this` but its own object.
    const refused: string[] = [];
    const parts = Object.create(null);
    const holdFixed = (key: string, value: unknown) =>
      Object.defineProperty(parts, key, { value, enumerable: true });
    holdFixed('version', '3');
    holdFixed('Emitter', nativeFunction(Emitter));
    holdFixed(
      'ping',
      nativeFunction(function (this: unknown) {
        if (this !== parts) refused.push("a held method's this");
        return 'pong';
      })
    );
    holdFixed(
      'take',
      nativeFunction((given: unknown) => {
        if (given !== parts) refused.push('the global handed back');
      })
    );
    const app = startAppIn('testing', 'new', { nativeParts: parts });
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('parts--plain');
    // The bundle extends the class it reads from the global as it loads.
    const native = app.fakeGlobal.nativeParts;
    class StoryEmitter extends native.Emitter {}
    expect(new StoryEmitter('taps').describe()).toBe('emits taps');
    expect(native.version).toBe('3');
    expect(native.ping()).toBe('pong');
    native.take(native);
    expect(refused).toEqual([]);

    const recording = storyRecordingOf('parts--plain');
    const names = [...GLOBALS_OF_A_NEW_APP.slice(0, 4), 'nativeParts', 'nativeFabricUIManager'];
    expect(recording?.blindRoads).toEqual(globalsAtStart(names, ['nativeParts']));
    const ref = (handle: string, type = 'function') => ({ $: 'native', handle, type });
    expect(
      recording?.nativeCalls.map(({ module, method, args, answer }) => [
        module,
        method,
        args,
        answer,
      ])
    ).toEqual([
      ...DATA_ENTRIES_AT_START,
      ['global', 'installed', ['nativeParts'], ref('nativeParts', 'object')],
      LIST_ENTRY_AT_START,
      ['nativeParts', 'get', ['Emitter'], ref('#1')],
      ['#1', 'get', ['prototype'], {}],
      ['#1', 'construct', [['taps'], { $: 'subclass' }], ref('#2', 'object')],
      ['#2', 'get', ['describe'], ref('#3')],
      ['#3', 'apply', [ref('#2', 'object'), []], 'emits taps'],
      ['nativeParts', 'get', ['version'], '3'],
      ['nativeParts', 'get', ['ping'], ref('#4')],
      ['#4', 'apply', [ref('nativeParts', 'object'), []], 'pong'],
      ['nativeParts', 'get', ['take'], ref('#5')],
      [
        '#5',
        'apply',
        [ref('nativeParts', 'object'), [ref('nativeParts', 'object')]],
        { $: 'undefined' },
      ],
    ]);
  });

  it('a global the phone installed without enumerating it is recorded with what the bundle reads and calls on it', () => {
    class Emitter {
      constructor(readonly name: string) {}
      describe() {
        return `emits ${this.name}`;
      }
    }
    // Two globals a native side installs before the bundle runs without enumerating them: one
    // whose member class the bundle reads as it loads, one whose function it calls.
    const core = Object.create(null);
    core.Emitter = nativeFunction(Emitter);
    const refused: string[] = [];
    const bridge = Object.create(null);
    bridge.readBlocking = nativeFunction(function (this: unknown, key: string) {
      if (this !== bridge) refused.push("a method's this");
      return `held ${key}`;
    });
    const app = startAppIn(
      'testing',
      'new',
      {},
      { engine: { Math }, notEnumerated: { appCore: core, moduleBridge: bridge } }
    );
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('cart--full');
    class CartEmitter extends app.fakeGlobal.appCore.Emitter {}
    expect(new CartEmitter('cart').describe()).toBe('emits cart');
    expect(app.fakeGlobal.moduleBridge.readBlocking('cart')).toBe('held cart');
    expect(refused).toEqual([]);
    // Each is laid back as native laid it, and the engine's own are left as they are.
    expect(Object.getOwnPropertyDescriptor(app.fakeGlobal, 'appCore')?.enumerable).toBe(false);
    expect(app.fakeGlobal.Math).toBe(Math);

    const recording = storyRecordingOf('cart--full');
    const named = (recording?.blindRoads ?? []).map(({ name }) => name);
    expect(named).not.toContain('atStart:appCore');
    expect(named).not.toContain('atStart:moduleBridge');
    const ref = (handle: string, type = 'function') => ({ $: 'native', handle, type });
    expect(
      recording?.nativeCalls.map(({ module, method, args, answer }) => [
        module,
        method,
        args,
        answer,
      ])
    ).toEqual([
      ...DATA_ENTRIES_AT_START,
      ['global', 'installed', ['appCore'], ref('appCore', 'object')],
      ['global', 'installed', ['moduleBridge'], ref('moduleBridge', 'object')],
      [
        'global',
        'notFromThePhone',
        ['Math', ...MADE_BY_THE_BUNDLE],
        { Math: { type: 'object', tag: 'Math' }, ...BUNDLE_KINDS },
      ],
      ['appCore', 'get', ['Emitter'], ref('#1')],
      ['#1', 'get', ['prototype'], {}],
      ['#1', 'construct', [['cart'], { $: 'subclass' }], ref('#2', 'object')],
      ['#2', 'get', ['describe'], ref('#3')],
      ['#3', 'apply', [ref('#2', 'object'), []], 'emits cart'],
      ['moduleBridge', 'get', ['readBlocking'], ref('#4')],
      ['#4', 'apply', [ref('moduleBridge', 'object'), ['cart']], 'held cart'],
    ]);
  });

  it('a global a recorded native call lays that is neither native nor data is named as unseen, never skipped', () => {
    const app = startAppIn('testing', 'new');
    app.fakeGlobal.nativeModulesOfTheTest = {
      Loader: {
        // Native code that runs JavaScript of its own as it loads, laying globals as it goes.
        load: () => {
          app.fakeGlobal.loadedHelpers = { unpack: (value: unknown) => value };
          app.fakeGlobal.loadedCount = 3;
        },
      },
    };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('loader--ready');
    // The bundle's own global, laid before the call, is the bundle's.
    app.fakeGlobal.appHelper = () => undefined;
    registry.get('Loader').load();

    const recording = storyRecordingOf('loader--ready');
    const named = (recording?.blindRoads ?? []).map(({ kind, name }) => `${kind} ${name}`);
    expect(named).toContain('jsiGlobal loadedHelpers');
    expect(named.filter((name) => name.includes('appHelper'))).toEqual([]);
    expect(
      recording?.nativeCalls.filter(
        ({ module, method, args }) =>
          module === 'global' && method === 'installed' && args[0] === 'loadedCount'
      )
    ).toEqual([expect.objectContaining({ answer: 3 })]);
  });

  it('a global that cannot be replaced has the shape of its own members recorded by reading alone', () => {
    class Emitter {}
    const touched: string[] = [];
    const members: Record<string, unknown> = {
      version: '5',
      Emitter: nativeFunction(Emitter),
      modules: {},
      ping: nativeFunction(() => 'pong'),
    };
    Object.defineProperty(members, 'lazy', {
      get: () => touched.push('a getter run'),
      enumerable: true,
      configurable: true,
    });
    // What the recorder does to the global's object, beyond reading what it holds.
    const core = new Proxy(members, {
      set: (target, key, value) => {
        touched.push(`a write of ${String(key)}`);
        return Reflect.set(target, key, value);
      },
      defineProperty: (target, key, description) => {
        touched.push(`a definition of ${String(key)}`);
        return Reflect.defineProperty(target, key, description);
      },
    });
    const app = startAppIn('testing', 'new', {}, { readOnly: { appCore: core } });
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('core--plain');
    // The bundle reads a member as it loads, and is handed the very object native laid.
    expect(app.fakeGlobal.appCore.Emitter).toBe(members.Emitter);
    expect(app.fakeGlobal.appCore).toBe(core);
    expect(touched).toEqual([]);

    const recording = storyRecordingOf('core--plain');
    const ref = (handle: string, type = 'function') => ({ $: 'native', handle, type });
    expect(
      recording?.nativeCalls.filter(
        ({ module, method }) => module === 'global' && method === 'shape'
      )
    ).toEqual([
      expect.objectContaining({
        args: ['appCore'],
        kind: 'sync',
        answer: {
          $: 'shape',
          type: 'object',
          members: {
            version: '5',
            Emitter: ref('appCore.Emitter'),
            modules: ref('appCore.modules', 'object'),
            ping: ref('appCore.ping'),
            lazy: { $: 'accessor' },
          },
        },
      }),
    ]);
    // The shape stands for the global in every story: no story is named unseen for it, so the
    // quick check judges each by what its own draw asks beyond the shape.
    const roadsOf = (storyId: string) =>
      (storyRecordingOf(storyId)?.blindRoads ?? []).map(({ name }) => name);
    expect(roadsOf('core--plain')).not.toContain('atStart:appCore');

    // Native changes a member as a later story runs: that story, and only from then on, meets
    // the global other than its shape, so it alone is named unseen for it.
    startStoryRecording('core--updated');
    members.version = '6';
    expect(roadsOf('core--updated')).toContain('atStart:appCore');
    expect(roadsOf('core--plain')).not.toContain('atStart:appCore');

    // A story that begins with the global still changed draws with it so, even should native
    // change it back before the story is read.
    startStoryRecording('core--restored');
    members.version = '5';
    expect(roadsOf('core--restored')).toContain('atStart:appCore');
    expect(touched).toEqual([]);
  });

  it('a module lookup is recorded present or absent whichever way it is asked', () => {
    // A library's module table, as native code installs it on a global of its own.
    const library = Object.create(null);
    library.modules = { Camera: { capture: nativeFunction(() => 'photo') } };
    const app = startAppIn('testing', 'new', {
      nativeModuleProxy: { Haptics: { impact: () => true } },
      library,
    });
    app.fakeGlobal.nativeModulesOfTheTest = { Clipboard: { getString: () => 'copied' } };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);
    const nativeModules = runFile(app, NATIVE_MODULES, nativeModulesSource).default;

    startStoryRecording('camera--ready');
    // Each lookup is noted each time it is made.
    expect(registry.get('Clipboard')).not.toBeNull();
    expect(registry.get('Clipboard')).not.toBeNull();
    expect(registry.get('Torch')).toBeNull();
    expect(nativeModules.Haptics.impact()).toBe(true);
    expect(nativeModules.Lidar).toBeUndefined();
    expect('Haptics' in nativeModules).toBe(true);
    expect('Lidar' in nativeModules).toBe(false);
    const modules = app.fakeGlobal.library.modules;
    expect(modules.Camera).toBeDefined();
    expect(modules.Scanner).toBeUndefined();
    expect('Camera' in modules).toBe(true);

    const module = { $: 'module' };
    expect(
      storyRecordingOf('camera--ready')?.nativeCalls.map(({ module, method, args, answer }) => [
        module,
        method,
        args,
        answer,
      ])
    ).toEqual([
      ...DATA_ENTRIES_AT_START,
      ['global', 'installed', ['library'], { $: 'native', handle: 'library', type: 'object' }],
      LIST_ENTRY_AT_START,
      ['__turboModuleProxy', 'lookup', ['Clipboard'], module],
      ['__turboModuleProxy', 'lookup', ['Clipboard'], module],
      ['__turboModuleProxy', 'lookup', ['Torch'], null],
      ['nativeModuleProxy', 'lookup', ['Haptics'], module],
      ['Haptics', 'impact', [], true],
      ['nativeModuleProxy', 'lookup', ['Lidar'], null],
      ['nativeModuleProxy', 'has', ['Haptics'], true],
      ['nativeModuleProxy', 'has', ['Lidar'], false],
      ['library', 'get', ['modules'], { $: 'native', handle: '#1', type: 'object' }],
      ['#1', 'get', ['Camera'], { $: 'native', handle: '#2', type: 'object' }],
      ['#1', 'get', ['Scanner'], { $: 'undefined' }],
      ['#1', 'has', ['Camera'], true],
    ]);
  });

  it('a function nested in an argument to native is recorded as a callback, and native calling it is recorded', () => {
    let options: any;
    const uploader = Object.create(null);
    uploader.start = nativeFunction((given: unknown) => {
      options = given;
    });
    const app = startAppIn('testing', 'new', { uploader });
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('upload--running');
    const progress: number[] = [];
    const steps: string[] = [];
    app.fakeGlobal.uploader.start({
      file: 'a.png',
      onProgress: (percent: number) => progress.push(percent),
      steps: [() => steps.push('sent')],
      // A function bound for a second runtime, however deep, is a road the recorder cannot see.
      render: { onFrame: Object.assign(() => undefined, { __workletHash: 2 }) },
    });
    // Native code calls what it was handed later, on its own.
    const {
      onProgress,
      steps: [sent],
    } = options;
    onProgress(50);
    sent();

    const recording = storyRecordingOf('upload--running');
    expect(progress).toEqual([50]);
    expect(steps).toEqual(['sent']);
    expect(recording?.blindRoads).toEqual([
      ...globalsAtStart(
        [...GLOBALS_OF_A_NEW_APP.slice(0, 4), 'uploader', 'nativeFabricUIManager'],
        ['uploader']
      ),
      { kind: 'workletRuntime', name: '#1.apply', order: 7 },
    ]);
    expect(
      recording?.nativeCalls.map(({ module, method, args, kind }) => [module, method, args, kind])
    ).toEqual([
      ...KINDS_AT_START.slice(0, -1),
      ['global', 'installed', ['uploader'], 'sync'],
      KINDS_AT_START.at(-1),
      ['uploader', 'get', ['start'], 'sync'],
      [
        '#1',
        'apply',
        [
          { $: 'native', handle: 'uploader', type: 'object' },
          [
            {
              file: 'a.png',
              onProgress: { $: 'callback', handle: '#2' },
              steps: [{ $: 'callback', handle: '#3' }],
              render: { onFrame: { $unserialisable: 'function' } },
            },
          ],
        ],
        'sync',
      ],
      ['#2', 'apply', [{ $: 'undefined' }, [50]], 'async'],
      ['#3', 'apply', [{ $: 'undefined' }, []], 'async'],
    ]);
  });

  it('a story that reaches native through a road the recorder cannot see is marked as blind', () => {
    const worklets = Object.create(null);
    worklets.runOnUI = nativeFunction((work: () => void) => work);
    worklets.share = nativeFunction((value: unknown) => value);
    // A global native code installs read-only: the app cannot be handed a stand-in of it.
    const decoder = nativeFunction(() => 'decoded');
    const app = startAppIn(
      'testing',
      'new',
      { worklets },
      { readOnly: { imageDecoder: decoder }, withoutCallableRoad: true }
    );
    // A renderer of another shape: its lines are not found, so it is left as it is.
    const otherRenderer = 'var events = global.nativeFabricUIManager.registerEventHandler;';
    expect(markNativeRoads(FABRIC_RENDERER, otherRenderer)).toBe(otherRenderer);
    runFile(app, FABRIC_RENDERER, otherRenderer);

    startStoryRecording('map--live');
    // A function bound for a second runtime, and a value that cannot be written down.
    app.fakeGlobal.worklets.runOnUI(Object.assign(() => undefined, { __workletHash: 1 }));
    app.fakeGlobal.worklets.share(new ArrayBuffer(4));
    expect(app.fakeGlobal.imageDecoder()).toBe('decoded');
    // What a library installs outside a recorded call: native functions and objects with no
    // prototype. The app's own globals are not native.
    app.fakeGlobal.createRuntime = Math.max;
    app.fakeGlobal.imageCache = Object.create(null);
    app.fakeGlobal.appSettings = { theme: 'dark' };
    app.fakeGlobal.appHelper = () => undefined;

    const recording = storyRecordingOf('map--live');
    expect(recording?.blindRoads).toEqual([
      ...globalsAtStart(GLOBALS_OF_A_NEW_APP.slice(0, 4)),
      // Order 4 is the shape of `imageDecoder`, which stands for it: the quick check sees the
      // story call it beyond the shape, so the recorder names no road for it.
      { kind: 'jsiGlobal', name: 'atStart:nativeFabricUIManager', order: 5 },
      { kind: 'workletRuntime', name: '#1.apply', order: 8 },
      { kind: 'jsiGlobal', name: 'unrecordable:#3.apply', order: 11 },
      // What the bundle read of each before the recorder saw it stays unseen: orders 13 and 15
      // record each from then on.
      { kind: 'jsiGlobal', name: 'createRuntime', order: 14 },
      { kind: 'jsiGlobal', name: 'imageCache', order: 16 },
      { kind: 'jsiGlobal', name: 'nativeFabricUIManager', order: 17 },
      { kind: 'expoNativeEvent', name: 'callableModules', order: 18 },
    ]);
    expect(recording?.pictureAt).toBe(19);
    expect(recording?.nativeCalls.find(({ method }) => method === 'shape')).toMatchObject({
      order: 4,
      args: ['imageDecoder'],
      answer: { $: 'shape', type: 'function' },
    });
    // A native global first seen outside a recorded call is recorded from then on like any other:
    // each later read of it is written down.
    startStoryRecording('map--later');
    expect(app.fakeGlobal.createRuntime(1, 2)).toBe(2);
    app.fakeGlobal.imageCache.hit = 'yes';
    expect(app.fakeGlobal.imageCache.hit).toBe('yes');
    expect(
      storyRecordingOf('map--later')
        ?.nativeCalls.filter(({ order }) => order >= 13)
        .map(({ module, method, args }) => [module, method, args])
    ).toEqual([
      ['global', 'installed', ['createRuntime']],
      ['global', 'installed', ['imageCache']],
      ['createRuntime', 'apply', [{ $: 'global' }, [1, 2]]],
      ['imageCache', 'set', ['hit', 'yes']],
      ['imageCache', 'get', ['hit']],
    ]);

    // A lookup native code installed read-only cannot be watched.
    const fixedApp = startAppIn(
      'testing',
      'new',
      {},
      {
        readOnly: {
          __turboModuleProxy: (name: string) =>
            name === 'SherloModule' ? { getSherloConstants: () => ({ mode: 'testing' }) } : null,
        },
      }
    );
    runFile(fixedApp, FABRIC_RENDERER, rendererSource);
    startStoryRecording('map--fixed');
    expect(storyRecordingOf('map--fixed')?.blindRoads).toEqual([
      ...globalsAtStart(GLOBALS_OF_A_NEW_APP),
      { kind: 'jsiGlobal', name: '__turboModuleProxy', order: 5 },
    ]);

    // A story whose roads were all seen carries only what the app had as it began.
    const seenApp = startAppIn('testing', 'new');
    runFile(seenApp, FABRIC_RENDERER, rendererSource);
    startStoryRecording('map--still');
    expect(storyRecordingOf('map--still')?.blindRoads).toEqual(
      globalsAtStart(GLOBALS_OF_A_NEW_APP)
    );
  });

  it("a native global laid while native code answers the read of a module's constant is recorded, with each member the bundle reads of it at load", () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    const laidByNative = bridgeLaidByNative();
    app.fakeGlobal.nativeModulesOfTheTest = {
      Installer: {
        // Native code works out the module's constants on their first read, and lays a global
        // of its own as it does: a read, not a call.
        get methods() {
          app.fakeGlobal.coreBridge = laidByNative;
          return {};
        },
      },
    };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);

    // The bundle as it loads, before any story: it reads the constant, then a member of the
    // global the read laid, with no call of native in between.
    expect(registry.get('Installer').methods).toEqual({});
    expect(lastCallsAfterBridgeRead(app, 'bridge--loaded', 4)).toEqual([
      ['__turboModuleProxy', 'lookup', ['Installer']],
      // Laid as the read ran, so taken up as it ended, ahead of the constant it answered.
      ['global', 'installed', ['coreBridge']],
      ['Installer', 'methods', []],
      ['coreBridge', 'get', ['Emitter']],
    ]);
  });

  it('a native global laid while native code answers a module lookup is recorded, with each member the bundle reads of it at load', () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    const laidByNative = bridgeLaidByNative();
    app.fakeGlobal.nativeModulesOfTheTest = {
      // Native code makes the module as it is first looked up, and lays a global of its own as
      // it does.
      get Installer() {
        app.fakeGlobal.coreBridge = laidByNative;
        return {};
      },
    };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);

    // The bundle as it loads: it looks the module up, then reads a member of the global the
    // lookup laid, with no other run of native in between.
    expect(registry.get('Installer')).toBeTruthy();
    expect(lastCallsAfterBridgeRead(app, 'bridge--looked-up', 3)).toEqual([
      ['__turboModuleProxy', 'lookup', ['Installer']],
      // Laid as the lookup ran, so taken up as it ended.
      ['global', 'installed', ['coreBridge']],
      ['coreBridge', 'get', ['Emitter']],
    ]);
  });

  it('a native global laid as native code deletes another, leaving the count of globals as it was, is recorded', () => {
    const app = startAppIn('testing', 'new', { spare: 1 });
    runFile(app, FABRIC_RENDERER, rendererSource);
    const laidByNative = bridgeLaidByNative();
    app.fakeGlobal.nativeModulesOfTheTest = {
      Installer: {
        get methods() {
          delete app.fakeGlobal.spare;
          app.fakeGlobal.coreBridge = laidByNative;
          return {};
        },
      },
    };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);
    const installer = registry.get('Installer');
    const before = Object.getOwnPropertyNames(app.fakeGlobal).length;

    expect(installer.methods).toEqual({});
    expect(Object.getOwnPropertyNames(app.fakeGlobal)).toHaveLength(before);
    expect(lastCallsAfterBridgeRead(app, 'bridge--swapped', 3)).toEqual([
      ['global', 'installed', ['coreBridge']],
      ['Installer', 'methods', []],
      ['coreBridge', 'get', ['Emitter']],
    ]);
  });

  it('a data global laid as native code lays the last-listed global again and deletes another is recorded with its value', () => {
    const app = startAppIn('testing', 'new', { spare: 1 });
    runFile(app, FABRIC_RENDERER, rendererSource);
    app.fakeGlobal.nativeModulesOfTheTest = {
      Installer: {
        // The new global is listed ahead of the last one laid again, and the count stays.
        get methods() {
          app.fakeGlobal.level = { reading: 3 };
          delete app.fakeGlobal.spare;
          const { tail } = app.fakeGlobal;
          delete app.fakeGlobal.tail;
          app.fakeGlobal.tail = tail;
          return {};
        },
      },
    };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);
    const installer = registry.get('Installer');
    // The global listed last as native code begins its run.
    app.fakeGlobal.tail = 'last';
    const listed = Object.getOwnPropertyNames(app.fakeGlobal);

    expect(installer.methods).toEqual({});
    const listedAfter = Object.getOwnPropertyNames(app.fakeGlobal);
    expect(listedAfter).toHaveLength(listed.length);
    expect(listedAfter[listedAfter.length - 1]).toBe(listed[listed.length - 1]);
    expect(app.fakeGlobal.level.reading).toBe(3);
    startStoryRecording('level--read');

    expect(storyRecordingOf('level--read')?.nativeCalls.slice(-2)).toEqual([
      expect.objectContaining({
        module: 'global',
        method: 'installed',
        args: ['level'],
        answer: { reading: 3 },
      }),
      expect.objectContaining({ module: 'Installer', method: 'methods' }),
    ]);
  });

  it('a run of native reads that lays no global walks the names of the globals at most once', () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    app.fakeGlobal.nativeModulesOfTheTest = { Meter: { unit: 'mm' } };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);
    const meter = registry.get('Meter');
    startStoryRecording('meter--read');

    // Each listing of the global object's names counts a walk as it is gone through.
    let walks = 0;
    const listNames = Object.getOwnPropertyNames;
    const listing = vi.spyOn(Object, 'getOwnPropertyNames').mockImplementation((value) => {
      const names = listNames(value);
      if (value !== app.fakeGlobal) return names;
      const walk = names.forEach.bind(names);
      Object.defineProperty(names, 'forEach', {
        value: (...args: Parameters<typeof walk>) => {
          walks += 1;
          return walk(...args);
        },
      });
      return names;
    });
    try {
      for (let read = 0; read < 10; read++) expect(meter.unit).toBe('mm');
    } finally {
      listing.mockRestore();
    }

    expect(walks).toBeLessThanOrEqual(1);
    expect(storyRecordingOf('meter--read')?.nativeCalls).toContainEqual(
      expect.objectContaining({ module: 'Meter', method: 'unit', answer: 'mm' })
    );
  });

  it('a value native handed out reaches native again as itself, at any depth and in any container', () => {
    // A library's native half: it hands out objects of its own and, as a host function does,
    // refuses anything but the very object it made where it expects one back.
    const made = Object.create(null);
    made.describe = nativeFunction(() => 'made natively');
    // An object native code holds a method to: the bundle calls it with the object as `this`.
    const sealedMade = Object.create(null);
    Object.defineProperty(sealedMade, 'whoAmI', {
      enumerable: true,
      value: nativeFunction(function (this: unknown) {
        if (this !== sealedMade) refused.push("a held method's this");
      }),
    });
    const keeper = { keep: () => true };
    const refused: string[] = [];
    let deepest = (held: any) => held;
    const findIn: Record<string, (held: any) => unknown> = {
      'a class instance': (held) => held.item,
      'a Map': (held) => held.get('item'),
      'a Set': (held) => Array.from(held)[0],
      'a deep object': (held) => deepest(held),
      'a frozen class instance': (held) => held.item,
      'a cyclic object': (held) => held.self.item,
      "a callback's answer": (held) => held(),
      'a class instance holding a native function': (held) => held.item,
      'a member of a function that cannot be changed': (held) => held.item,
      'a carrier whose walk throws': (held) => held.item,
      'a native object holding a held native method': (held) => held,
      'a global of the app holding a native function': (held) => held.item,
      'a Map holding a function of the app': (held) => held.get('item'),
    };
    const received: Record<string, unknown> = {};
    const ofTheApp = () => "the app's own";
    deepest = (held) => (held.inner ? deepest(held.inner) : held.item);
    const store = Object.create(null);
    store.make = nativeFunction(() => made);
    store.makeSealed = nativeFunction(() => sealedMade);
    store.take = nativeFunction((where: string, held: unknown) => {
      const expectedOf: Record<string, unknown> = {
        'a module': keeper,
        'a class instance holding a native function': store.make,
        'a native object holding a held native method': sealedMade,
        'a global of the app holding a native function': store.make,
        'a Map holding a function of the app': ofTheApp,
      };
      received[where] = held;
      const expected = where in expectedOf ? expectedOf[where] : made;
      const found = where === 'a module' ? held : findIn[where](held);
      if (found !== expected) refused.push(where);
    });
    // A callback's answer is not written down, so the one blind road it can have is its own.
    store.hold = nativeFunction((give: () => { item: unknown }) => {
      if (give().item !== ofTheApp) refused.push('a class instance holding a function of the app');
    });
    const app = startAppIn('testing', 'new', { store });
    app.fakeGlobal.nativeModulesOfTheTest = { Keeper: keeper };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('store--full');
    const native = app.fakeGlobal.store;
    const handedOut = native.make();
    class Shelf {
      constructor(readonly item: unknown) {}
    }
    const shelf = new Shelf(handedOut);
    let deep: any = { item: handedOut };
    for (let level = 0; level < 20; level++) deep = { inner: deep };
    const cyclic: any = { item: handedOut };
    cyclic.self = cyclic;
    native.take('a class instance', shelf);
    native.take('a Map', new Map([['item', handedOut]]));
    native.take('a Set', new Set([handedOut]));
    native.take('a deep object', deep);
    native.take('a frozen class instance', Object.freeze(new Shelf(handedOut)));
    native.take('a cyclic object', cyclic);
    native.take("a callback's answer", () => handedOut);
    native.take('a module', registry.get('Keeper'));
    native.take('a class instance holding a native function', new Shelf(native.make));
    const carrier = () => 'carried';
    Object.defineProperty(carrier, 'item', { value: handedOut, enumerable: true });
    native.take('a member of a function that cannot be changed', carrier);
    const sealed = native.makeSealed();
    sealed.whoAmI();
    native.take('a native object holding a held native method', sealed);
    // A global the app made, holding a stand-in, is the app's own: never taken for native's.
    app.fakeGlobal.appHelpers = { item: native.make };
    native.make();
    native.take('a global of the app holding a native function', app.fakeGlobal.appHelpers);
    // A function of the app left inside a container changed in place: native calls go unseen.
    native.hold(() => new Shelf(ofTheApp));
    native.take('a Map holding a function of the app', new Map([['item', ofTheApp]]));
    // The recorder's look at one of its members throws: the rest still reaches native as itself.
    const unreadable = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('an object of the app refuses the look');
        },
      }
    );
    native.take('a carrier whose walk throws', Object.assign(new Shelf(handedOut), { unreadable }));

    expect(refused).toEqual([]);
    // The function the bundle cannot have changed keeps its stand-in; native got a copy.
    expect((carrier as unknown as { item: unknown }).item).toBe(handedOut);
    const carried = received['a member of a function that cannot be changed'] as () => string;
    expect(typeof carried).toBe('function');
    expect(carried()).toBe('carried');
    // The app goes on with what it holds, now the native value itself.
    expect(shelf.item).toBe(made);
    expect(handedOut.describe()).toBe('made natively');
    // Its uses go unseen from then on: no story can be vouched for on it.
    startStoryRecording('store--empty');
    const blindOfEveryStory = storyRecordingOf('store--empty')?.blindRoads;
    expect(blindOfEveryStory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'jsiGlobal', name: 'unwrapped:#2' }),
        expect.objectContaining({ kind: 'jsiGlobal', name: 'recorderStopped' }),
      ])
    );
    // The object native holds a method to is recorded through its stand-in, never blind.
    expect(blindOfEveryStory).not.toContainEqual(
      expect.objectContaining({ name: expect.stringMatching(/\.apply$/) })
    );
    // A function of the app native may call unseen: the story it ran in cannot be vouched for.
    expect(storyRecordingOf('store--full')?.blindRoads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'jsiGlobal', name: 'unrecordable:#9.apply' }),
      ])
    );
  });

  it('a value native hands the bundle by any road reaches native again as itself', async () => {
    // What native makes, fresh for each road: an object native code holds a method of, and one
    // whose native method could be swapped.
    const madeFor = (road: string): object[] => {
      const sealed = Object.create(null);
      Object.defineProperty(sealed, 'whoAmI', {
        enumerable: true,
        value: nativeFunction(() => road),
      });
      const plain = Object.create(null);
      plain.run = nativeFunction(() => road);
      return [sealed, plain];
    };
    const made: Record<string, object[]> = {};
    [
      'a stand-in answer',
      'a stand-in promise',
      "a stand-in callback's argument",
      'a held property',
      'a constructed value',
      'a global',
      'a global installed between stories',
      'a module answer',
      'a module promise',
      "a module callback's argument",
      'a module constant',
      'a module',
      "a callable module's argument",
    ].forEach((road) => {
      made[road] = madeFor(road);
    });
    // A method of a module the engine holds, as the bundle reads it, and the module table itself.
    made["a module's held function"] = [() => 'held'];
    made['the module table'] = [{ Haptics: { impact: nativeFunction(() => true) } }];
    const at = (road: string, index: number) => made[road][index];

    let got: unknown;
    const store = Object.create(null);
    store.take = nativeFunction((value: unknown) => {
      got = value;
    });
    store.answer = nativeFunction((index: number) => at('a stand-in answer', index));
    store.later = nativeFunction((index: number) =>
      Promise.resolve(at('a stand-in promise', index))
    );
    store.callBack = nativeFunction((index: number, call: (value: unknown) => void) =>
      call(at("a stand-in callback's argument", index))
    );
    store.Made = nativeFunction(function (index: number) {
      return at('a constructed value', index);
    });
    made['a held property'].forEach((value, index) => {
      Object.defineProperty(store, `held${index}`, { value, enumerable: true });
    });
    const maker: Record<string, unknown> = {
      answer: (index: number) => at('a module answer', index),
      later: (index: number) => Promise.resolve(at('a module promise', index)),
      callBack: (index: number, call: (value: unknown) => void) =>
        call(at("a module callback's argument", index)),
      constant0: at('a module constant', 0),
      constant1: at('a module constant', 1),
    };
    Object.defineProperty(maker, 'held', {
      value: at("a module's held function", 0),
      enumerable: true,
    });
    const app = startAppIn('testing', 'new', {
      store,
      aGlobal0: at('a global', 0),
      aGlobal1: at('a global', 1),
      nativeModuleProxy: at('the module table', 0),
    });
    app.fakeGlobal.nativeModulesOfTheTest = {
      Maker: maker,
      SealedModule: at('a module', 0),
      PlainModule: at('a module', 1),
    };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);
    const nativeModules = runFile(app, NATIVE_MODULES, nativeModulesSource).default;
    const receivedByTheApp: unknown[] = [];
    app.registerCallableModule('Receiver', {
      receive: (value: unknown) => receivedByTheApp.push(value),
    });
    made['a global installed between stories'].forEach((value, index) => {
      app.fakeGlobal[`lateGlobal${index}`] = value;
    });

    startStoryRecording('store--full');
    const native = app.fakeGlobal.store;
    const makerOfTheApp = registry.get('Maker');
    const caught = (give: (call: (value: unknown) => void) => void) => {
      let value: unknown;
      give((given) => {
        value = given;
      });
      return value;
    };
    const reach: Record<string, (index: number) => unknown> = {
      'a stand-in answer': (index) => native.answer(index),
      'a stand-in promise': (index) => native.later(index),
      "a stand-in callback's argument": (index) => caught((call) => native.callBack(index, call)),
      'a held property': (index) => native[`held${index}`],
      'a constructed value': (index) => new native.Made(index),
      'a global': (index) => app.fakeGlobal[`aGlobal${index}`],
      'a global installed between stories': (index) => app.fakeGlobal[`lateGlobal${index}`],
      'a module answer': (index) => makerOfTheApp.answer(index),
      'a module promise': (index) => makerOfTheApp.later(index),
      "a module callback's argument": (index) =>
        caught((call) => makerOfTheApp.callBack(index, call)),
      'a module constant': (index) => makerOfTheApp[`constant${index}`],
      'a module': (index) => registry.get(['SealedModule', 'PlainModule'][index]),
      "a callable module's argument": (index) => {
        app.callableModule('Receiver').receive(at("a callable module's argument", index));
        return receivedByTheApp.pop();
      },
      "a module's held function": () => makerOfTheApp.held,
      'the module table': () => nativeModules,
    };
    class Shelf {
      constructor(readonly item: unknown) {}
    }
    const refused: string[] = [];
    for (const [road, values] of Object.entries(made)) {
      for (const [index, value] of values.entries()) {
        const membersOf = () =>
          Object.getOwnPropertyNames(value).map((key) => (value as Record<string, unknown>)[key]);
        const members = membersOf();
        const reached = reach[road](index);
        const handedOut = road.endsWith('promise') ? await reached : reached;
        native.take(handedOut);
        if (got !== value) refused.push(`${road} ${index}`);
        // Native gets the shelf with the native value in place, and the app hands that back.
        const shelf = new Shelf(handedOut);
        native.take(shelf);
        native.take(shelf.item);
        if (got !== value) refused.push(`${road} ${index}, from a shelf`);
        // Nor is anything inside it changed.
        if (membersOf().some((member, at) => member !== members[at])) {
          refused.push(`${road} ${index}, changed inside`);
        }
      }
    }
    expect(refused).toEqual([]);
  });

  it('an app that freezes a native value it was handed goes on as it would unrecorded', () => {
    // A native value with a member native holds fixed, and a plain one.
    const makers: Record<string, () => any> = {
      fixed: () => {
        const value = Object.create(null);
        Object.defineProperty(value, 'ping', {
          value: nativeFunction(() => 'pong'),
          enumerable: true,
        });
        value.count = 1;
        return value;
      },
      plain: () => {
        const value = Object.create(null);
        value.ping = nativeFunction(() => 'pong');
        value.count = 1;
        return value;
      },
    };
    const ways: Record<string, [(value: any) => unknown, (value: any) => boolean]> = {
      freeze: [Object.freeze, Object.isFrozen],
      seal: [Object.seal, Object.isSealed],
      preventExtensions: [Object.preventExtensions, (value) => !Object.isExtensible(value)],
    };
    const reals: Record<string, any> = {};
    Object.keys(makers).forEach((kind) => {
      Object.keys(ways).forEach((way) => {
        reals[`${kind}${way}`] = makers[kind]();
      });
    });
    const app = startAppIn('testing', 'new', reals);
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('values--frozen');
    Object.keys(reals).forEach((name) => {
      const [stop, isStopped] = ways[name.replace(/^(fixed|plain)/, '')];
      const handed = app.fakeGlobal[name];
      expect(() => stop(handed), name).not.toThrow();
      expect(isStopped(handed), name).toBe(true);
      expect(isStopped(reals[name]), name).toBe(true);
      expect(Object.keys(handed), name).toEqual(['ping', 'count']);
      expect(handed.ping(), name).toBe('pong');
      expect(handed.count, name).toBe(1);
      expect(Object.getOwnPropertyDescriptor(handed, 'count')?.value, name).toBe(1);
    });
    expect(storyRecordingOf('values--frozen')?.blindRoads).not.toContainEqual(
      expect.objectContaining({ name: 'recorderStopped' })
    );
  });

  it('an app whose recorder throws still starts, and its stories are recorded as blind', () => {
    // A library's native half that refuses a look at what it is made from, as a host object may:
    // the recorder's own look at it throws.
    const read = nativeFunction(() => 21);
    const sensor = new Proxy(Object.create(null), {
      get: (_, key) => (key === 'read' ? read : undefined),
      getPrototypeOf: () => {
        throw new Error('a host object refuses the look');
      },
    });
    // Another native object, recorded before the stop: its method answers only on the very object,
    // and it keeps what it is handed.
    let taken: unknown;
    const meter = Object.create(null);
    meter.read = nativeFunction(function (this: unknown) {
      return this === meter ? 21 : 0;
    });
    meter.take = nativeFunction((value: unknown) => {
      taken = value;
    });
    const app = startAppIn('testing', 'new', { meter, sensor });
    runFile(app, FABRIC_RENDERER, rendererSource);
    const meterOfTheApp = app.fakeGlobal.meter;

    // The app starts as it would unrecorded.
    expect(app.fakeGlobal.sensor.read()).toBe(21);

    startStoryRecording('sensor--first');
    expect(app.fakeGlobal.sensor.read()).toBe(21);
    // After the stop, native still meets its own object, as the method's `this` and as a value
    // the app held from before the stop.
    expect(meterOfTheApp.read()).toBe(21);
    meterOfTheApp.take(meterOfTheApp);
    expect(taken).toBe(meter);
    const stopped = expect.objectContaining({ kind: 'jsiGlobal', name: 'recorderStopped' });
    expect(storyRecordingOf('sensor--first')?.blindRoads).toEqual(
      expect.arrayContaining([stopped])
    );
    startStoryRecording('sensor--second');
    expect(storyRecordingOf('sensor--second')?.blindRoads).toEqual(
      expect.arrayContaining([stopped])
    );
  });

  it("the recorder's stop carries what threw in its own work, cut short, and the app never meets it", () => {
    // A native object that refuses the recorder's look with a long message.
    const refusal = `a host object refuses the look ${'and goes on '.repeat(100)}`;
    const read = nativeFunction(() => 21);
    const sensor = new Proxy(Object.create(null), {
      get: (_, key) => (key === 'read' ? read : undefined),
      getPrototypeOf: () => {
        throw new TypeError(refusal);
      },
    });
    const app = startAppIn('testing', 'new', { sensor });
    runFile(app, FABRIC_RENDERER, rendererSource);

    expect(app.fakeGlobal.sensor.read()).toBe(21);
    startStoryRecording('sensor--why');
    expect(app.fakeGlobal.sensor.read()).toBe(21);

    const stops = (storyRecordingOf('sensor--why')?.blindRoads ?? []).filter(
      (road) => road.name === 'recorderStopped'
    );
    expect(stops).toHaveLength(1);
    // Beyond the sealed seam's type: a reader that does not know `why` skips it.
    const { why } = stops[0] as { why?: { message: string; name: string; step: string } };
    expect(why?.name).toBe('TypeError');
    expect(why?.message).toBe(refusal.slice(0, 200));
    // The step is the top frames of the throw's stack alone, never its message.
    expect(why?.step).toMatch(/^\s*at /);
    expect(why?.step.split('\n').length).toBeLessThanOrEqual(3);
    expect(why?.step.length).toBeLessThanOrEqual(400);
    expect(why?.step).not.toContain('refuses the look');
  });

  it('a device event delivered as a story runs is recorded in order with its payload', () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    const deviceEvents = runFile(app, DEVICE_EVENT_EMITTER, deviceEventEmitterSource).default;
    app.registerCallableModule('RCTDeviceEventEmitter', deviceEvents);
    const heard: string[] = [];
    deviceEvents.addListener('appStateDidChange', (state: string) => heard.push(state));

    startStoryRecording('settings--dark');
    // Native code sends each event through the module the bundle registered.
    const native = app.callableModule('RCTDeviceEventEmitter');
    native.emit('appStateDidChange', 'active');
    native.emit('appStateDidChange', 'background');
    const recording = storyRecordingOf('settings--dark');
    // After the picture an event no longer changes the pictured story.
    native.emit('keyboardDidShow', { height: 300 });

    expect(recording?.blindRoads).toEqual(globalsAtStart(GLOBALS_OF_A_NEW_APP));
    expect(
      recording?.nativeCalls.map(({ module, method, args, kind }) => [module, method, args, kind])
    ).toEqual([
      ...KINDS_AT_START,
      ['callable:RCTDeviceEventEmitter', 'emit', ['appStateDidChange', 'active'], 'async'],
      ['callable:RCTDeviceEventEmitter', 'emit', ['appStateDidChange', 'background'], 'async'],
    ]);
    expect(
      storyRecordingOf('settings--dark')?.nativeCalls[ENTRIES_AT_START.length + 2]
    ).toMatchObject({
      args: ['keyboardDidShow', { height: 300 }],
      afterPicture: true,
    });
    // Every listener heard every event, as without the recorder.
    expect(heard).toEqual(['active', 'background']);
  });

  it('a device event the app got before the first story is recorded with every story', () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    const deviceEvents = runFile(app, DEVICE_EVENT_EMITTER, deviceEventEmitterSource).default;
    app.registerCallableModule('RCTDeviceEventEmitter', deviceEvents);
    const native = app.callableModule('RCTDeviceEventEmitter');
    native.emit('didUpdateDimensions', { window: { width: 390 } });
    // Sherlo's own messages, by the names the SDK listens on, are the SDK talking: they are not
    // recorded. Any other name is the app's, however it starts.
    native.emit(MESSAGE_EVENT, '{"action":"START"}');
    native.emit(UNANSWERED_EVENT, '{}');
    native.emit('SherloOther', {});

    const events = [
      ...ENTRIES_AT_START.map(([, , args]) => args),
      ['didUpdateDimensions', { window: { width: 390 } }],
      ['SherloOther', {}],
    ];
    startStoryRecording('cards--first');
    const first = storyRecordingOf('cards--first');
    expect(first?.blindRoads).toEqual(globalsAtStart(GLOBALS_OF_A_NEW_APP));
    expect(first?.nativeCalls.map(({ args }) => args)).toEqual(events);
    startStoryRecording('cards--later');
    expect(storyRecordingOf('cards--later')?.nativeCalls.map(({ args }) => args)).toEqual(events);
  });

  it("a device event after a story's picture marks every later story and not the pictured one", () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    const deviceEvents = runFile(app, DEVICE_EVENT_EMITTER, deviceEventEmitterSource).default;
    app.registerCallableModule('RCTDeviceEventEmitter', deviceEvents);

    startStoryRecording('form--empty');
    expect(storyRecordingOf('form--empty')?.pictureAt).toBe(5);
    app.callableModule('RCTDeviceEventEmitter').emit('keyboardDidShow', { height: 300 });
    expect(storyRecordingOf('form--empty')?.blindRoads).toEqual(
      globalsAtStart(GLOBALS_OF_A_NEW_APP)
    );

    startStoryRecording('form--filled');
    expect(storyRecordingOf('form--filled')?.blindRoads).toEqual([
      ...globalsAtStart(GLOBALS_OF_A_NEW_APP),
      { kind: 'expoNativeEvent', name: 'callable:RCTDeviceEventEmitter.emit', order: 7 },
    ]);
    startStoryRecording('form--sent');
    expect(storyRecordingOf('form--sent')?.blindRoads).toEqual([
      ...globalsAtStart(GLOBALS_OF_A_NEW_APP),
      { kind: 'expoNativeEvent', name: 'callable:RCTDeviceEventEmitter.emit', order: 9 },
    ]);
  });

  it('a story that listens for a device event that never comes is not blind', () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    const deviceEvents = runFile(app, DEVICE_EVENT_EMITTER, deviceEventEmitterSource).default;
    app.registerCallableModule('RCTDeviceEventEmitter', deviceEvents);

    startStoryRecording('settings--light');
    deviceEvents.addListener('appStateDidChange', () => undefined);

    expect(storyRecordingOf('settings--light')?.blindRoads).toEqual(
      globalsAtStart(GLOBALS_OF_A_NEW_APP)
    );
  });

  it('every global the app had as its JavaScript began is handed over by name with each story', () => {
    const app = startAppIn('testing', 'new', { nativeLogger: Math.max });
    runFile(app, FABRIC_RENDERER, rendererSource);
    // Sherlo's own globals are the SDK's, not the app's.
    expect(app.fakeGlobal.__sherloStillReal).toBeDefined();

    // A global native code installed is recorded in place of its name.
    const atStart = globalsAtStart(
      [
        '__turboModuleProxy',
        '__d',
        'eventsReactRan',
        'nativeModulesOfTheTest',
        'nativeLogger',
        'nativeFabricUIManager',
      ],
      ['nativeLogger']
    );
    startStoryRecording('logs--plain');
    expect(storyRecordingOf('logs--plain')?.blindRoads).toEqual(atStart);
    expect(storyRecordingOf('logs--plain')?.nativeCalls).toEqual([
      ...CALLS_AT_START.slice(0, -1),
      expect.objectContaining({
        module: 'global',
        method: 'installed',
        args: ['nativeLogger'],
        answer: { $: 'native', handle: 'nativeLogger', type: 'function' },
      }),
      // The list, after the five start globals the bundle did not make.
      { ...CALLS_AT_START.at(-1), order: 5 },
    ]);
    startStoryRecording('logs--long');
    expect(storyRecordingOf('logs--long')?.blindRoads).toEqual(atStart);
  });

  it('a start global holding plain data is recorded as its value, never only named', () => {
    const settings = { theme: 'dark', sizes: [1, 2.5], shown: true, note: null };
    const app = startAppIn('testing', 'new', {
      buildFlavour: 'night',
      launchCount: 3,
      settings,
      nothingYet: undefined,
    });
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('settings--dark');
    const recording = storyRecordingOf('settings--dark');
    const installed = (recording?.nativeCalls ?? [])
      .filter(({ module, method }) => module === 'global' && method === 'installed')
      .map(({ args, kind, answer }) => [args[0], kind, answer]);
    expect(installed).toEqual(
      expect.arrayContaining([
        ['buildFlavour', 'sync', 'night'],
        ['launchCount', 'sync', 3],
        ['settings', 'sync', settings],
        ['nothingYet', 'sync', { $: 'undefined' }],
      ])
    );
    const named = (recording?.blindRoads ?? []).map(({ name }) => name);
    ['buildFlavour', 'launchCount', 'settings', 'nothingYet'].forEach((name) => {
      expect(named).not.toContain(`atStart:${name}`);
    });
    // The bundle is handed the very values it had: recording them changes nothing.
    expect(app.fakeGlobal.settings).toBe(settings);
    expect(app.fakeGlobal.buildFlavour).toBe('night');
  });

  it("the start globals the bundle or the engine made are listed once for the quick check to find, never as the phone's", () => {
    const moduleTable = { 0: { factory: () => undefined, isInitialized: false } };
    const defineModule = () => undefined;
    const app = startAppIn(
      'testing',
      'new',
      { defineModule, moduleTable },
      { engine: { NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY, Math: Math } }
    );
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('shop--cart');
    const recording = storyRecordingOf('shop--cart');
    const listed = (recording?.nativeCalls ?? []).filter(
      ({ module, method }) => module === 'global' && method === 'notFromThePhone'
    );
    expect(listed).toEqual([
      expect.objectContaining({
        args: ['NaN', 'Infinity', 'Math', '__d', 'defineModule', 'moduleTable'],
        kind: 'sync',
      }),
    ]);
    // Neither held as a value nor named as unseen.
    const others = JSON.stringify({
      ...recording,
      nativeCalls: recording?.nativeCalls.filter((entry) => !listed.includes(entry)),
    });
    ['defineModule', 'moduleTable', 'NaN', 'Infinity', 'Math'].forEach((name) => {
      expect(others).not.toContain(`"${name}"`);
      expect(others).not.toContain(`atStart:${name}`);
    });
    expect(app.fakeGlobal.defineModule).toBe(defineModule);
    expect(app.fakeGlobal.moduleTable).toBe(moduleTable);
    // Every story is handed the one list again, never a second.
    startStoryRecording('shop--empty');
    expect(
      storyRecordingOf('shop--empty')?.nativeCalls.filter(
        ({ method }) => method === 'notFromThePhone'
      )
    ).toEqual(listed);
  });

  it("a phone global taken for the engine's is listed with what it is, for the quick check to tell it from its own", () => {
    // Native values laid where the engine lays its own, among them one in place of an engine
    // global: the recorder takes them for the engine's.
    const phoneTable = Object.create(null);
    phoneTable.read = nativeFunction(() => 'phone');
    const phoneParse = nativeFunction(function readNumber(_text: string) {
      return 7;
    });
    const app = startAppIn(
      'testing',
      'new',
      {},
      { engine: { Math: phoneTable, parseInt: phoneParse, JSON } }
    );
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('table--read');
    const listed = storyRecordingOf('table--read')?.nativeCalls.find(
      ({ method }) => method === 'notFromThePhone'
    );
    // What the quick check's own engine holds under those names differs from these in kind, tag
    // or name, so it takes each for the phone's, never its own.
    expect(listed?.answer).toMatchObject({
      Math: { type: 'object', tag: { $: 'undefined' } },
      parseInt: { type: 'function', native: true, name: 'readNumber', length: 1 },
      JSON: { type: 'object', tag: 'JSON' },
    });
    // The bundle is still handed what native laid.
    expect(app.fakeGlobal.Math).toBe(phoneTable);
  });

  it("an engine global laid after the phone's first enumerable one is recorded, never dropped", () => {
    const app = startAppIn(
      'testing',
      'new',
      {},
      { notEnumerated: { max: Math.max, notANumber: Number.NaN } }
    );
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('chart--max');
    expect(app.fakeGlobal.max(2, 5)).toBe(5);
    const recording = storyRecordingOf('chart--max');
    const installed = (recording?.nativeCalls ?? [])
      .filter(({ module, method }) => module === 'global' && method === 'installed')
      .map(({ args }) => args[0]);
    // Judged by what it is: a native function stood in for, data written down as its value.
    expect(installed).toEqual(expect.arrayContaining(['max', 'notANumber']));
    expect(recording?.nativeCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: 'max', method: 'apply', answer: 5 }),
      ])
    );
  });

  it('an app on the old architecture sends no recording', () => {
    const app = startAppIn('testing', 'old');
    expect(app.fakeGlobal.__sherloNativeRecorder).toBeUndefined();
    expect(app.fakeGlobal.__sherloNativeRoad).toBeUndefined();
    app.fakeGlobal.nativeModulesOfTheTest = { Clipboard: { getString: () => 'copied' } };
    const clipboard = runFile(app, TURBO_MODULE_REGISTRY, registrySource).get('Clipboard');

    startStoryRecording('buttons--primary');
    expect(clipboard.getString()).toBe('copied');
    expect(storyRecordingOf('buttons--primary')).toBeUndefined();

    // Outside a test run nothing is recorded on any architecture.
    const browsing = startAppIn('storybook', 'new');
    expect(browsing.fakeGlobal.__sherloNativeRecorder).toBeUndefined();
    expect(storyRecordingOf('buttons--primary')).toBeUndefined();
  });
});
