/**
 * The app records what each story asked of native, for the quick check to replay: the polyfill's
 * recorder (metro/polyfill.js), the lines the transformer adds to the files that reach native
 * (metro/mockSpecifierTransformer.js) and what the SDK reads of it per story (../nativeRecording).
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
const EXPO_LOOKUP = 'node_modules/expo-modules-core/src/requireNativeModule.ts';
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

// What native installed before the bundle began, handed over with every story ahead of the rest.
function globalsAtStart(names: string[]) {
  return names.map((name, order) => ({ kind: 'jsiGlobal', name: `atStart:${name}`, order }));
}

const registrySource = [
  'module.exports = {',
  '  get: function (name) { return global.nativeModulesOfTheTest[name] || null; },',
  '  getEnforcing: function (name) { return global.nativeModulesOfTheTest[name]; },',
  '};',
].join('\n');

const expoLookupSource = [
  'module.exports = {',
  '  requireNativeModule: function (name) { return global.expo.modules[name]; },',
  '  requireOptionalNativeModule: function (name) { return global.expo.modules[name] || null; },',
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

type App = { fakeGlobal: Record<string, any>; dispatch: (...args: unknown[]) => void };

// The polyfill run as the app's JavaScript starts in `mode`; the new architecture carries Fabric's
// UI manager, the old one does not.
function startAppIn(mode: string, architecture: 'new' | 'old', extras: Record<string, any> = {}) {
  const app: App = { fakeGlobal: {}, dispatch: () => undefined };
  app.fakeGlobal = {
    __turboModuleProxy: (name: string) =>
      name === 'SherloModule' ? { getSherloConstants: () => ({ mode }) } : null,
    __d: vi.fn(),
    eventsReactRan: [],
    nativeModulesOfTheTest: {},
    ...extras,
  };
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
        module: 'TurboModuleRegistry',
        method: 'get',
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
        module: 'TurboModuleRegistry',
        method: 'get',
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
      ['TurboModuleRegistry', 'get'],
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
      ['get', true],
      ['impact', true],
    ]);
  });

  it('a story that reaches native through a road the recorder cannot see is marked as blind', () => {
    const expo = {
      modules: {
        ExpoLocation: { addListener: () => ({ remove: () => undefined }), getStatus: () => 'on' },
        ExpoBattery: { level: () => 1 },
      },
    };
    const app = startAppIn('testing', 'new', { expo });
    const expoLookup = runFile(app, EXPO_LOOKUP, expoLookupSource);
    // A renderer of another shape: its lines are not found, so it is left as it is.
    const otherRenderer = 'var events = global.nativeFabricUIManager.registerEventHandler;';
    expect(markNativeRoads(FABRIC_RENDERER, otherRenderer)).toBe(otherRenderer);
    runFile(app, FABRIC_RENDERER, otherRenderer);

    startStoryRecording('map--live');
    const location = expoLookup.requireNativeModule('ExpoLocation');
    expect(location.getStatus()).toBe('on');
    location.addListener('onChange', () => undefined);
    expect(app.fakeGlobal.expo.modules.ExpoBattery.level()).toBe(1);
    // What a library installs as the story runs: native functions and objects with no prototype.
    app.fakeGlobal.createWorkletRuntime = Math.max;
    app.fakeGlobal.imageDecoder = Object.create(null);
    app.fakeGlobal.appSettings = { theme: 'dark' };
    app.fakeGlobal.appHelper = () => undefined;

    const recording = storyRecordingOf('map--live');
    expect(recording?.blindRoads).toEqual([
      ...globalsAtStart([
        '__turboModuleProxy',
        '__d',
        'eventsReactRan',
        'nativeModulesOfTheTest',
        'expo',
        'nativeFabricUIManager',
      ]),
      { kind: 'expoNativeEvent', name: 'ExpoLocation', order: 9 },
      { kind: 'expoSkippedLookup', name: 'ExpoBattery', order: 10 },
      { kind: 'workletRuntime', name: 'createWorkletRuntime', order: 11 },
      { kind: 'jsiGlobal', name: 'imageDecoder', order: 12 },
      { kind: 'jsiGlobal', name: 'nativeFabricUIManager', order: 13 },
    ]);
    expect(recording?.pictureAt).toBe(14);
    expect(recording?.nativeCalls.map(({ module, method }) => [module, method])).toEqual([
      ['expo', 'requireNativeModule'],
      ['ExpoLocation', 'getStatus'],
      ['ExpoLocation', 'addListener'],
    ]);

    // A story whose roads were all seen carries only what the app had as it began.
    const seenApp = startAppIn('testing', 'new');
    runFile(seenApp, FABRIC_RENDERER, rendererSource);
    startStoryRecording('map--still');
    expect(storyRecordingOf('map--still')?.blindRoads).toEqual(
      globalsAtStart(GLOBALS_OF_A_NEW_APP)
    );
  });

  it('a device event delivered as a story runs marks the story as blind and names the event', () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    const deviceEvents = runFile(app, DEVICE_EVENT_EMITTER, deviceEventEmitterSource).default;
    const heard: string[] = [];
    deviceEvents.addListener('appStateDidChange', (state: string) => heard.push(state));

    startStoryRecording('settings--dark');
    deviceEvents.emit('appStateDidChange', 'active');
    deviceEvents.emit('appStateDidChange', 'background');
    const recording = storyRecordingOf('settings--dark');
    // After the picture an event no longer changes the pictured story.
    deviceEvents.emit('keyboardDidShow', { height: 300 });

    const blindRoads = [
      ...globalsAtStart(GLOBALS_OF_A_NEW_APP),
      { kind: 'expoNativeEvent', name: 'deviceEvent:appStateDidChange', order: 5 },
    ];
    expect(recording?.blindRoads).toEqual(blindRoads);
    expect(recording?.pictureAt).toBe(6);
    expect(storyRecordingOf('settings--dark')?.blindRoads).toEqual(blindRoads);
    // Every listener heard every event, as without the recorder.
    expect(heard).toEqual(['active', 'background']);
  });

  it('a device event the app got before the first story marks every story', () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    const deviceEvents = runFile(app, DEVICE_EVENT_EMITTER, deviceEventEmitterSource).default;
    deviceEvents.emit('didUpdateDimensions', { window: { width: 390 } });
    // Sherlo's own messages, by the names the SDK listens on, are the SDK talking: they mark
    // nothing. Any other name is the app's, however it starts.
    deviceEvents.emit(MESSAGE_EVENT, '{"action":"START"}');
    deviceEvents.emit(UNANSWERED_EVENT, '{}');
    deviceEvents.emit('SherloOther', {});

    const blindRoads = [
      ...globalsAtStart(GLOBALS_OF_A_NEW_APP),
      { kind: 'expoNativeEvent', name: 'deviceEvent:didUpdateDimensions', order: 5 },
      { kind: 'expoNativeEvent', name: 'deviceEvent:SherloOther', order: 6 },
    ];
    startStoryRecording('cards--first');
    expect(storyRecordingOf('cards--first')?.blindRoads).toEqual(blindRoads);
    startStoryRecording('cards--later');
    expect(storyRecordingOf('cards--later')?.blindRoads).toEqual(blindRoads);
  });

  it("a device event after a story's picture marks every later story and not the pictured one", () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    const deviceEvents = runFile(app, DEVICE_EVENT_EMITTER, deviceEventEmitterSource).default;

    startStoryRecording('form--empty');
    expect(storyRecordingOf('form--empty')?.pictureAt).toBe(5);
    deviceEvents.emit('keyboardDidShow', { height: 300 });
    expect(storyRecordingOf('form--empty')?.blindRoads).toEqual(
      globalsAtStart(GLOBALS_OF_A_NEW_APP)
    );

    startStoryRecording('form--filled');
    expect(storyRecordingOf('form--filled')?.blindRoads).toEqual([
      ...globalsAtStart(GLOBALS_OF_A_NEW_APP),
      { kind: 'expoNativeEvent', name: 'deviceEvent:keyboardDidShow', order: 6 },
    ]);
    startStoryRecording('form--sent');
    expect(storyRecordingOf('form--sent')?.blindRoads).toEqual([
      ...globalsAtStart(GLOBALS_OF_A_NEW_APP),
      { kind: 'expoNativeEvent', name: 'deviceEvent:keyboardDidShow', order: 8 },
    ]);
  });

  it('a story that listens for a device event that never comes is not blind', () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    const deviceEvents = runFile(app, DEVICE_EVENT_EMITTER, deviceEventEmitterSource).default;

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

    const atStart = globalsAtStart([
      '__turboModuleProxy',
      '__d',
      'eventsReactRan',
      'nativeModulesOfTheTest',
      'nativeLogger',
      'nativeFabricUIManager',
    ]);
    startStoryRecording('logs--plain');
    expect(storyRecordingOf('logs--plain')?.blindRoads).toEqual(atStart);
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
