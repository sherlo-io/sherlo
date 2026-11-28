/**
 * What the recorder (metro/polyfill.js) notes one level below a global that cannot be replaced:
 * each member that is a function gets a shape of its own, read through descriptions alone, so the
 * quick check can answer the load's reads of it as the phone did. An object below the global is
 * never read, but for one of the engine's own prototypes, nor anything below a function's own
 * members.
 */
import { startStoryRecording, storyRecordingOf } from '../nativeRecording';

import {
  FABRIC_RENDERER,
  registrySource,
  rendererSource,
  TURBO_MODULE_REGISTRY,
} from './nativeRoadFiles';
import { forgetTheRecorder, nativeFunction, runFile, startAppIn } from './recordingApp';

afterEach(forgetTheRecorder);

// A global native lays that the app cannot replace: a class whose members the engine keeps, each
// listing of them counted, with a getter and a call that would be noted if run, and an object
// native answers as it is asked, every ask of it counted. The class's prototype is such an object
// too.
function nativeCore() {
  const asked: string[] = [];
  let listings = 0;
  const answeredByNative = (name: string) =>
    new Proxy(Object.create(null), {
      get: (target, key) => {
        asked.push(`${name}: a read of ${String(key)}`);
        return Reflect.get(target, key);
      },
      ownKeys: (target) => {
        asked.push(`${name}: a list of its keys`);
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor: (target, key) => {
        asked.push(`${name}: a description of ${String(key)}`);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
  function Widget() {}
  Object.defineProperty(Widget, 'prototype', { value: answeredByNative('the prototype') });
  Object.defineProperty(Widget, 'kind', { value: 'plain', configurable: true });
  Object.defineProperty(Widget, 'lazy', { get: () => asked.push('the class: a getter run') });
  const widget = new Proxy(Widget, {
    apply: () => asked.push('the class: a call'),
    construct: () => {
      asked.push('the class: a construction');
      return {};
    },
    ownKeys: (target) => {
      listings += 1;
      return Reflect.ownKeys(target);
    },
  });
  const core = { version: '5', Widget: widget, registry: answeredByNative('the registry') };
  return { asked, core, listings: () => listings, Widget };
}

const notesOf = (storyId: string, method: string) =>
  (storyRecordingOf(storyId)?.nativeCalls ?? []).filter(
    (entry) => entry.module === 'global' && entry.method === method
  );

const roadsOf = (storyId: string) =>
  (storyRecordingOf(storyId)?.blindRoads ?? []).map(({ name }) => name);

describe('what the recorder notes below a global that cannot be replaced', () => {
  it('a function member of a global that cannot be replaced has its own members recorded by reading their descriptions alone, and what lies below them is named unread', () => {
    const native = nativeCore();
    const app = startAppIn('testing', 'new', {}, { readOnly: { appCore: native.core } });
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('core--first');
    expect(notesOf('core--first', 'shape')).toContainEqual(
      expect.objectContaining({
        args: ['appCore.Widget'],
        answer: {
          $: 'shape',
          type: 'function',
          members: {
            length: 0,
            name: 'Widget',
            prototype: { $: 'native', handle: 'appCore.Widget.prototype', type: 'object' },
            kind: 'plain',
            lazy: { $: 'accessor' },
          },
        },
      })
    );
    expect(notesOf('core--first', 'shapeCut').map(({ answer }) => answer)).toEqual([
      ['appCore.registry', 'appCore.Widget.prototype'],
    ]);
    // Nothing was asked of an object below the global, and the class was neither run nor had a
    // getter of its run.
    expect(native.asked).toEqual([]);
  });

  it("a shaped global's member that is one of the engine's own prototypes is shaped and not listed unread", () => {
    startAppIn('testing', 'new', {}, { readOnly: { AppError: Error } });

    startStoryRecording('error--first');
    expect(notesOf('error--first', 'shape')).toContainEqual(
      expect.objectContaining({
        args: ['AppError.prototype'],
        answer: {
          $: 'shape',
          type: 'object',
          members: expect.objectContaining({
            name: 'Error',
            message: '',
            toString: { $: 'native', handle: 'AppError.prototype.toString', type: 'function' },
          }),
        },
      })
    );
    expect(notesOf('error--first', 'shape').map(({ args }) => args[0])).toContain(
      'AppError.prototype.toString'
    );
    const unread = notesOf('error--first', 'shapeCut').flatMap(({ answer }) => answer);
    expect(unread).not.toContain('AppError.prototype');
    expect(unread).not.toContain('AppError.prototype.toString');
  });

  it("a shaped global's object member that is not an engine prototype stays unread", () => {
    const native = nativeCore();
    function Gadget() {}
    const core = { ...native.core, Gadget, plain: Object.create(Object.prototype) };
    startAppIn('testing', 'new', {}, { readOnly: { appCore: core } });

    startStoryRecording('core--plain-objects');
    const shaped = notesOf('core--plain-objects', 'shape').map(({ args }) => args[0]);
    expect(shaped).not.toContain('appCore.plain');
    expect(shaped).not.toContain('appCore.Gadget.prototype');
    expect(shaped).not.toContain('appCore.Widget.prototype');
    expect(notesOf('core--plain-objects', 'shapeCut').flatMap(({ answer }) => answer)).toEqual(
      expect.arrayContaining([
        'appCore.plain',
        'appCore.Gadget.prototype',
        'appCore.Widget.prototype',
      ])
    );
    expect(native.asked).toEqual([]);
  });

  it("a prototype's constructor that is the shaped global is noted as a link to it", () => {
    startAppIn('testing', 'new', {}, { readOnly: { AppError: Error } });

    startStoryRecording('error--linked');
    expect(notesOf('error--linked', 'shape')).toContainEqual(
      expect.objectContaining({
        args: ['AppError.prototype'],
        answer: expect.objectContaining({
          members: expect.objectContaining({
            constructor: { $: 'link', handle: 'AppError', type: 'function' },
          }),
        }),
      })
    );
    expect(notesOf('error--linked', 'shape').map(({ args }) => args[0])).not.toContain(
      'AppError.prototype.constructor'
    );
  });

  it('a story that begins with a function member of a global that cannot be replaced changed by native is unseen through that global', () => {
    const native = nativeCore();
    const app = startAppIn('testing', 'new', {}, { readOnly: { appCore: native.core } });
    runFile(app, FABRIC_RENDERER, rendererSource);

    startStoryRecording('core--plain');
    expect(roadsOf('core--plain')).not.toContain('atStart:appCore');

    // Native changes a member of the class, and the global's own members stay as they were.
    startStoryRecording('core--changed');
    Object.defineProperty(native.Widget, 'kind', { value: 'fancy' });
    expect(roadsOf('core--changed')).toContain('atStart:appCore');
    expect(roadsOf('core--plain')).not.toContain('atStart:appCore');
  });

  it('a shaped engine prototype the app changes after its shapes were noted makes the road unseen', () => {
    startAppIn('testing', 'new', {}, { readOnly: { AppError: Error } });

    startStoryRecording('error--plain');
    expect(roadsOf('error--plain')).not.toContain('atStart:AppError');

    startStoryRecording('error--changed');
    Object.defineProperty(Error.prototype, 'addedByTheApp', { value: 1, configurable: true });
    try {
      expect(roadsOf('error--changed')).toContain('atStart:AppError');
      expect(roadsOf('error--plain')).not.toContain('atStart:AppError');
    } finally {
      delete (Error.prototype as { addedByTheApp?: number }).addedByTheApp;
    }
  });

  it('the members of a function member of a global that cannot be replaced are listed as its shapes are noted and as a story starts or is read, never across a run of native reads', () => {
    const native = nativeCore();
    const app = startAppIn('testing', 'new', {}, { readOnly: { appCore: native.core } });
    runFile(app, FABRIC_RENDERER, rendererSource);
    expect(native.listings()).toBe(1);
    app.fakeGlobal.nativeModulesOfTheTest = { Meter: { unit: 'mm' } };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);
    const meter = registry.get('Meter');
    startStoryRecording('meter--read');
    expect(native.listings()).toBe(2);

    for (let read = 0; read < 10; read++) expect(meter.unit).toBe('mm');

    expect(native.listings()).toBe(2);
    expect(notesOf('meter--read', 'shape')).toHaveLength(2);
    expect(native.listings()).toBe(3);
  });

  it('a member read of a recorded native object is noted in its turn even when its note is kept only once native answered', () => {
    const app = startAppIn('testing', 'new');
    runFile(app, FABRIC_RENDERER, rendererSource);
    app.fakeGlobal.nativeModulesOfTheTest = {
      // Native lays a global that cannot be replaced only as the module's constants are first read.
      Installer: {
        get exported() {
          Object.defineProperty(app.fakeGlobal, 'appCore', {
            value: { ping: nativeFunction(() => 'pong') },
            enumerable: true,
            writable: false,
          });
          return {};
        },
      },
    };
    const registry = runFile(app, TURBO_MODULE_REGISTRY, registrySource);
    const installer = registry.get('Installer');
    // The bundle reads the global before that read, and finds none.
    expect(app.fakeGlobal.appCore).toBeUndefined();
    expect(installer.exported).toEqual({});

    startStoryRecording('core--laid-in-a-read');
    // The read is the last entry before native ran, so the global is laid as that read is
    // answered, not as the lookup before it is.
    const calls = storyRecordingOf('core--laid-in-a-read')?.nativeCalls ?? [];
    expect(
      calls
        .slice(-4)
        .map(({ module, method, order, laidAfter }: any) => [module, method, order, laidAfter])
    ).toEqual([
      ['__turboModuleProxy', 'lookup', 5, undefined],
      ['Installer', 'exported', 6, undefined],
      ['global', 'shape', 7, 6],
      ['global', 'shape', 8, 6],
    ]);
  });
});
