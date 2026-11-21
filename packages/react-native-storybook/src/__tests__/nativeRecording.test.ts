/**
 * The app records what each story asked of native, for the quick check to replay: the polyfill's
 * recorder (metro/polyfill.js), the lines the transformer adds to the files that reach native
 * (metro/mockSpecifierTransformer.js) and what the SDK reads of it per story (../nativeRecording).
 *
 * The shape of each entry, as the recorder's head comment gives it in full: a module lookup is
 * { module: '__turboModuleProxy' | 'nativeModuleProxy', method: 'lookup', args: [name], answer:
 * { $: 'module' } | null }, each time; a global native code installed is { module: 'global',
 * method: 'installed', args: [name], answer: { $: 'native', handle: name, type } }; each use of a
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markNativeRoads } = require('../../metro/mockSpecifierTransformer.js');

const polyfillSource = fs.readFileSync(path.join(__dirname, '../../metro/polyfill.js'), 'utf8');

const TURBO_MODULE_REGISTRY =
  'node_modules/react-native/Libraries/TurboModule/TurboModuleRegistry.js';
const NATIVE_MODULES = 'node_modules/react-native/Libraries/BatchedBridge/NativeModules.js';
const CALLABLE_MODULES = 'node_modules/react-native/Libraries/Core/registerCallableModule.js';
const FABRIC_RENDERER =
  'node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-prod.js';
const DEVICE_EVENT_EMITTER =
  'node_modules/react-native/Libraries/EventEmitter/RCTDeviceEventEmitter.js';

// The globals of the test's app on the new architecture as its JavaScript begins.
const GLOBALS_OF_A_NEW_APP = [
  '__turboModuleProxy',
  '__d',
  'eventsReactRan',
  'nativeModulesOfTheTest',
  'nativeFabricUIManager',
];

// The globals the bundle began with, `names` in the order the app has them, handed over with every
// story ahead of the rest; the native ones `recorded` take their place in the order as recorded.
function globalsAtStart(names: string[], recorded: string[] = []) {
  return names
    .map((name, order) => ({ kind: 'jsiGlobal', name: `atStart:${name}`, order }))
    .filter(({ name }) => !recorded.includes(name.slice('atStart:'.length)));
}

// A function as native code makes it: the engine does not show its source.
function nativeFunction<T extends object>(implementation: T): T {
  return new Proxy(implementation, {});
}

// React Native's lookup of native modules, as the bundle has it: it reads the lookup native code
// installed once, as it loads.
const registrySource = [
  'var turboModuleProxy = global.__turboModuleProxy;',
  'module.exports = {',
  '  get: function (name) { return turboModuleProxy(name); },',
  '  getEnforcing: function (name) { return turboModuleProxy(name); },',
  '};',
].join('\n');

// React Native's table of native modules on a bridgeless app, which native code installs.
const nativeModulesSource =
  'module.exports = { __esModule: true, default: global.nativeModuleProxy };';

// React Native's registration of the modules native code calls into; `registered` stands for the
// list native code keeps.
const callableModulesSource = [
  'var registered = {};',
  'module.exports = {',
  '  __esModule: true,',
  '  registered: registered,',
  '  default: function (name, moduleOrFactory) {',
  "    registered[name] = typeof moduleOrFactory === 'function' ? moduleOrFactory : function () {",
  '      return moduleOrFactory;',
  '    };',
  '  },',
  '};',
].join('\n');

// The lines of React Native's Fabric renderer the transformer looks for, around a renderer of the
// test's own: `commit` commits the tree as React does.
const rendererSource = [
  'var _nativeFabricUIManage = global.nativeFabricUIManager,',
  '  completeRoot = _nativeFabricUIManage.completeRoot,',
  '  registerEventHandler = _nativeFabricUIManage.registerEventHandler;',
  'function dispatchEvent(target, topLevelType, nativeEvent) {',
  '  global.eventsReactRan.push(topLevelType);',
  '}',
  'registerEventHandler && registerEventHandler(dispatchEvent);',
  'module.exports = { commit: function () { completeRoot(1, []); } };',
].join('\n');

// React Native's emitter of device events, as the bundle has it: every event native sends to
// JavaScript goes out through its `emit`.
const deviceEventEmitterSource = [
  'var listeners = {};',
  'var emitter = {',
  '  addListener: function (name, listener) {',
  '    (listeners[name] = listeners[name] || []).push(listener);',
  '    return { remove: function () {} };',
  '  },',
  '  emit: function (name, payload) {',
  '    (listeners[name] || []).forEach(function (listener) { listener(payload); });',
  '  },',
  '};',
  'module.exports = { __esModule: true, default: emitter };',
].join('\n');

type App = {
  fakeGlobal: Record<string, any>;
  dispatch: (...args: unknown[]) => void;
  // The bundle registering a module native code may call into, and that module as native has it.
  registerCallableModule: (name: string, module: object) => void;
  callableModule: (name: string) => any;
};

// The polyfill run as the app's JavaScript starts in `mode`; the new architecture carries Fabric's
// UI manager, the old one does not. `readOnly` globals are installed as native code installs a
// global the app cannot replace; the registration of callable modules runs unless left out.
function startAppIn(
  mode: string,
  architecture: 'new' | 'old',
  extras: Record<string, any> = {},
  options: { readOnly?: Record<string, unknown>; withoutCallableRoad?: boolean } = {}
) {
  const app: App = {
    fakeGlobal: {},
    dispatch: () => undefined,
    registerCallableModule: () => undefined,
    callableModule: () => undefined,
  };
  app.fakeGlobal = {
    __turboModuleProxy: (name: string) =>
      app.fakeGlobal.nativeModulesOfTheTest[name] ??
      (name === 'SherloModule' ? { getSherloConstants: () => ({ mode }) } : null),
    __d: vi.fn(),
    eventsReactRan: [],
    nativeModulesOfTheTest: {},
    ...extras,
  };
  Object.entries(options.readOnly ?? {}).forEach(([name, value]) => {
    Object.defineProperty(app.fakeGlobal, name, { value, enumerable: true, writable: false });
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
      ['__turboModuleProxy', 'lookup'],
      ['Clipboard', 'getString'],
    ]);
    expect(storyRecordingOf('buttons--primary')?.nativeCalls).toHaveLength(6);

    // Each device setup is its own launch, with a recording of its own.
    const darkApp = startAppIn('testing', 'new');
    darkApp.fakeGlobal.nativeModulesOfTheTest = { Clipboard: { getString: () => 'dark' } };
    startStoryRecording('buttons--primary');
    runFile(darkApp, TURBO_MODULE_REGISTRY, registrySource).get('Clipboard').getString();
    expect(storyRecordingOf('buttons--primary')?.nativeCalls.map(({ answer }) => answer)).toEqual([
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
      nativeCalls: [],
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
      { kind: 'jsiGlobal', name: 'atStart:nativeFabricUIManager', order: 5 },
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
      ['global', 'installed', ['camera'], 'sync', cameraRef('camera', 'object')],
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
      ['global', 'installed', ['library'], { $: 'native', handle: 'library', type: 'object' }],
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
      ['global', 'installed', ['uploader'], 'sync'],
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
      { kind: 'jsiGlobal', name: 'atStart:imageDecoder', order: 5 },
      { kind: 'jsiGlobal', name: 'atStart:nativeFabricUIManager', order: 6 },
      { kind: 'workletRuntime', name: '#1.apply', order: 8 },
      { kind: 'jsiGlobal', name: 'unrecordable:#3.apply', order: 11 },
      { kind: 'jsiGlobal', name: 'createRuntime', order: 13 },
      { kind: 'jsiGlobal', name: 'imageCache', order: 14 },
      { kind: 'jsiGlobal', name: 'nativeFabricUIManager', order: 15 },
      { kind: 'expoNativeEvent', name: 'callableModules', order: 16 },
    ]);
    expect(recording?.pictureAt).toBe(17);

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
      ['callable:RCTDeviceEventEmitter', 'emit', ['appStateDidChange', 'active'], 'async'],
      ['callable:RCTDeviceEventEmitter', 'emit', ['appStateDidChange', 'background'], 'async'],
    ]);
    expect(storyRecordingOf('settings--dark')?.nativeCalls[2]).toMatchObject({
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
      expect.objectContaining({
        module: 'global',
        method: 'installed',
        args: ['nativeLogger'],
        answer: { $: 'native', handle: 'nativeLogger', type: 'function' },
      }),
    ]);
    startStoryRecording('logs--long');
    expect(storyRecordingOf('logs--long')?.blindRoads).toEqual(atStart);
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
