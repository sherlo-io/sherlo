/**
 * What the recorder (metro/polyfill.js) notes one level below a global that cannot be replaced:
 * each member that is a function gets a shape of its own, read through descriptions alone, so the
 * quick check can answer the load's reads of it as the phone did. An object below the global is
 * never read, nor anything below a function's own members.
 */
import { startStoryRecording, storyRecordingOf } from '../nativeRecording';

import {
  FABRIC_RENDERER,
  registrySource,
  rendererSource,
  TURBO_MODULE_REGISTRY,
} from './nativeRoadFiles';
import { forgetTheRecorder, runFile, startAppIn } from './recordingApp';

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

  it('a story that begins with a function member of a global that cannot be replaced changed by native is unseen through that global', () => {
    const native = nativeCore();
    const app = startAppIn('testing', 'new', {}, { readOnly: { appCore: native.core } });
    runFile(app, FABRIC_RENDERER, rendererSource);
    const roadsOf = (storyId: string) =>
      (storyRecordingOf(storyId)?.blindRoads ?? []).map(({ name }) => name);

    startStoryRecording('core--plain');
    expect(roadsOf('core--plain')).not.toContain('atStart:appCore');

    // Native changes a member of the class, and the global's own members stay as they were.
    startStoryRecording('core--changed');
    Object.defineProperty(native.Widget, 'kind', { value: 'fancy' });
    expect(roadsOf('core--changed')).toContain('atStart:appCore');
    expect(roadsOf('core--plain')).not.toContain('atStart:appCore');
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
});
