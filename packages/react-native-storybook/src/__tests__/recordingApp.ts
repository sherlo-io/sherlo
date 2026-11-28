/**
 * The app the native recording tests run (nativeRecording.test.ts): the polyfill run as the app's
 * JavaScript starts, the files of the app run as the bundle runs them, and what each story's
 * recording holds ahead of everything else.
 */
import { vi } from 'vitest';

import { rememberStoryOfTheApp } from '../componentNames';

import { builtPolyfillSource } from './builtPolyfill';
import { CALLABLE_MODULES, callableModulesSource } from './nativeRoadFiles';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markNativeRoads } = require('../../metro/mockSpecifierTransformer.js');

// The globals of the test's app on the new architecture as its JavaScript begins.
export const GLOBALS_OF_A_NEW_APP = [
  '__turboModuleProxy',
  '__d',
  'eventsReactRan',
  'nativeModulesOfTheTest',
  'nativeFabricUIManager',
];
// Of them, a function of the bundle's own source, never named as unseen...
export const MADE_BY_THE_BUNDLE = ['__d'];
// ...and the ones holding data, recorded as their values (an empty list and an empty object).
const DATA_AT_START = ['eventsReactRan', 'nativeModulesOfTheTest'];
// As each story's recording holds them, ahead of everything else: the data as its values, then,
// once every start global is through, the bundle's own listed for the quick check to find.
export const DATA_ENTRIES_AT_START = [
  ['global', 'installed', ['eventsReactRan'], []],
  ['global', 'installed', ['nativeModulesOfTheTest'], {}],
];
// The list comes after an app's own native globals too, as they are start globals as well. Each
// name carries what it is, for the quick check to tell its own global of that name from the
// phone's: the bundle's is a function of JavaScript source (the test's mock).
export const BUNDLE_KINDS = { __d: { type: 'function', native: false, name: 'Mock', length: 0 } };
export const LIST_ENTRY_AT_START = ['global', 'notFromThePhone', MADE_BY_THE_BUNDLE, BUNDLE_KINDS];
export const ENTRIES_AT_START = [...DATA_ENTRIES_AT_START, LIST_ENTRY_AT_START];
// The same entries in full, in their places in an app with no globals of its own: the data after
// `__turboModuleProxy`, the list after every start global the bundle did not make.
const ORDERS_AT_START = [1, 2, GLOBALS_OF_A_NEW_APP.length - MADE_BY_THE_BUNDLE.length];
export const CALLS_AT_START = ENTRIES_AT_START.map(([module, method, args, answer], index) => ({
  module,
  method,
  args,
  kind: 'sync',
  answer,
  order: ORDERS_AT_START[index],
  afterPicture: false,
}));
// The same entries as [module, method, args, kind].
export const KINDS_AT_START = CALLS_AT_START.map(({ module, method, args, kind }) => [
  module,
  method,
  args,
  kind,
]);

// The globals the bundle began with, `names` in the order the app has them, handed over with every
// story ahead of the rest; the bundle's own take no place, and the native ones `recorded` and the
// ones holding data take their place in the order as recorded.
export function globalsAtStart(names: string[], recorded: string[] = []) {
  return names
    .filter((name) => !MADE_BY_THE_BUNDLE.includes(name))
    .map((name, order) => ({ kind: 'jsiGlobal', name: `atStart:${name}`, order }))
    .filter(({ name }) => {
      const globalName = name.slice('atStart:'.length);
      return !recorded.includes(globalName) && !DATA_AT_START.includes(globalName);
    });
}

// A note the recorder keeps once for every story read from then on (a lookup a story made, a
// module's method the bundle read), as a story's recording holds it at `order`.
export function noteForEveryStory(method: string, args: unknown[], answer: unknown, order: number) {
  return { module: 'global', method, args, kind: 'sync', answer, order, afterPicture: false };
}

// A method of a test's module as the recorder writes what it is: a function of JavaScript source.
export function methodKind(name: string, length = 0) {
  return { type: 'function', native: false, name, length };
}

// A function as native code makes it: the engine does not show its source.
export function nativeFunction<T extends object>(implementation: T): T {
  return new Proxy(implementation, {});
}

export type App = {
  fakeGlobal: Record<string, any>;
  dispatch: (...args: unknown[]) => void;
  // The bundle registering a module native code may call into, and that module as native has it.
  registerCallableModule: (name: string, module: object) => void;
  callableModule: (name: string) => any;
};

// The polyfill run as the app's JavaScript starts in `mode`; the new architecture carries Fabric's
// UI manager, the old one does not. `readOnly` globals are installed as native code installs a
// global the app cannot replace, `notEnumerated` ones as a native side installs a global it does
// not enumerate; the registration of callable modules runs unless left out, from
// `callableModules` when given. Sherlo's native module says `mode` in its constants, with
// `sdkConstants` beside it.
export function startAppIn(
  mode: string,
  architecture: 'new' | 'old',
  extras: Record<string, any> = {},
  options: {
    readOnly?: Record<string, unknown>;
    notEnumerated?: Record<string, unknown>;
    engine?: Record<string, unknown>;
    globalObjectAs?: string[];
    withoutCallableRoad?: boolean;
    callableModules?: string;
    sdkConstants?: Record<string, unknown>;
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
  // The names the engine lays holding the global object itself, as `globalThis` does.
  (options.globalObjectAs ?? []).forEach((name) => {
    Object.defineProperty(app.fakeGlobal, name, {
      value: app.fakeGlobal,
      enumerable: false,
      writable: false,
    });
  });
  Object.assign(app.fakeGlobal, {
    __turboModuleProxy: (name: string) =>
      app.fakeGlobal.nativeModulesOfTheTest[name] ??
      (name === 'SherloModule'
        ? { getSherloConstants: () => ({ mode, ...options.sdkConstants }) }
        : null),
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
  new Function('global', `"use strict";\n${builtPolyfillSource()}`)(app.fakeGlobal);
  (globalThis as { __sherloNativeRecorder?: unknown }).__sherloNativeRecorder =
    app.fakeGlobal.__sherloNativeRecorder;
  if (!options.withoutCallableRoad) {
    const callables = runFile(
      app,
      CALLABLE_MODULES,
      options.callableModules ?? callableModulesSource
    );
    app.registerCallableModule = callables.default;
    app.callableModule = (name) => callables.registered[name]();
  }
  return app;
}

// After each test: the recorder its app handed the SDK and the story it was on are forgotten.
export function forgetTheRecorder() {
  delete (globalThis as { __sherloNativeRecorder?: unknown }).__sherloNativeRecorder;
  rememberStoryOfTheApp(undefined);
}

// Runs one file of the app as the bundle would, after the transformer marked it.
export function runFile(app: App, filename: string, source: string): any {
  const module = { exports: {} as any };
  // eslint-disable-next-line no-new-func
  new Function('global', 'module', markNativeRoads(filename, source))(app.fakeGlobal, module);
  return module.exports;
}
