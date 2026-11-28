/**
 * The recorder (metro/polyfill.js) writes down each draw the app's load makes from the language's
 * source of chance (CHANCE_SOURCE), for the replay to hand the load the phone's own draws in the
 * phone's order, and takes its wrap off exactly as the first story starts.
 */
import { startStoryRecording, storyRecordingOf } from '../nativeRecording';
import { CHANCE_SOURCE } from '../safeWrapping';

import { FABRIC_RENDERER, rendererSource } from './nativeRoadFiles';
import { forgetTheRecorder, nativeFunction, runFile, startAppIn } from './recordingApp';

afterEach(forgetTheRecorder);

const ENGINE_FLAGS = { writable: true, enumerable: false, configurable: true };

// The engine's holder of chance, its source handing out `draws` in turn, laid with `flags`.
function chanceHolder(
  draws: unknown[],
  flags: PropertyDescriptor = ENGINE_FLAGS,
  source: (...args: unknown[]) => unknown = nativeFunction(() => draws.shift())
) {
  const holder = {};
  Object.defineProperty(holder, CHANCE_SOURCE.key, { value: source, ...flags });
  return { holder, source, laid: Object.getOwnPropertyDescriptor(holder, CHANCE_SOURCE.key) };
}

// An app whose engine holds `holder`, started in a test run.
function appWith(holder: object) {
  const app = startAppIn('testing', 'new', {}, { engine: { [CHANCE_SOURCE.holder]: holder } });
  runFile(app, FABRIC_RENDERER, rendererSource);
  return app;
}

// What the app holds as its source of chance now, and one draw from it.
const sourceIn = (holder: object) => (holder as Record<string, () => unknown>)[CHANCE_SOURCE.key];
const draw = (holder: object) => sourceIn(holder)();

// The story's entries about chance, as [method, args, answer].
function chanceEntries(storyId: string) {
  return (storyRecordingOf(storyId)?.nativeCalls ?? [])
    .filter(({ module, method }) => module === 'global' && method.startsWith('drawn'))
    .map(({ method, args, answer }) => [method, args, answer]);
}

describe("the load's draws of chance", () => {
  it("each draw of chance the app's load makes is recorded in order with the very value the engine drew", () => {
    const { holder, source, laid } = chanceHolder([0.25, 0.5, 0.75, 0.125]);
    const app = appWith(holder);

    expect([draw(holder), draw(holder), draw(holder)]).toEqual([0.25, 0.5, 0.75]);
    startStoryRecording('ids--made');
    // After the load the app holds its own untouched function, laid as it was.
    expect(Object.getOwnPropertyDescriptor(holder, CHANCE_SOURCE.key)).toEqual(laid);
    expect(sourceIn(holder)).toBe(source);
    expect(draw(holder)).toBe(0.125);

    const drawn = [
      ['drawn', [], 0.25],
      ['drawn', [], 0.5],
      ['drawn', [], 0.75],
    ];
    expect(chanceEntries('ids--made')).toEqual(drawn);
    expect(app.fakeGlobal.__sherloNativeRecorder).toBeDefined();
    // Every story is handed the load's draws.
    startStoryRecording('ids--again');
    expect(chanceEntries('ids--again')).toEqual(drawn);
  });

  it('a load that draws past the cap has the draws past it told as unrecorded, and the wrap is taken off there', () => {
    const draws = Array.from({ length: 300 }, (_, index) => index / 300);
    const { holder, source } = chanceHolder([...draws]);
    appWith(holder);

    expect(draws.map(() => draw(holder))).toEqual(draws);
    expect(sourceIn(holder)).toBe(source);
    startStoryRecording('ids--many');
    const entries = chanceEntries('ids--many');
    expect(entries).toHaveLength(257);
    expect(entries.slice(0, 256)).toEqual(draws.slice(0, 256).map((value) => ['drawn', [], value]));
    expect(entries[256]).toEqual(['drawnNoMore', ['cap'], undefined]);
  });

  it('a source of chance already replaced when the recorder installs is not wrapped, and the recording says so', () => {
    const { holder, source, laid } = chanceHolder([0.5], ENGINE_FLAGS, () => 0.5);
    appWith(holder);

    expect(Object.getOwnPropertyDescriptor(holder, CHANCE_SOURCE.key)).toEqual(laid);
    expect(draw(holder)).toBe(0.5);
    expect(sourceIn(holder)).toBe(source);
    startStoryRecording('ids--replaced');
    expect(chanceEntries('ids--replaced')).toEqual([['drawnNoMore', ['replaced'], undefined]]);
  });

  it('a source of chance the engine holds to its value is not wrapped, and the recording says so', () => {
    const { holder, laid } = chanceHolder([0.5], { writable: false, configurable: false });
    appWith(holder);

    expect(Object.getOwnPropertyDescriptor(holder, CHANCE_SOURCE.key)).toEqual(laid);
    expect(draw(holder)).toBe(0.5);
    startStoryRecording('ids--held');
    expect(chanceEntries('ids--held')).toEqual([['drawnNoMore', ['heldToItsValue'], undefined]]);
  });

  it("a draw the recorder fails to write down reaches the app as the engine drew it, and the recorder's stop takes the wrap off", () => {
    // A value whose every read throws: writing it down throws in the recorder's own work.
    const unreadable = new Proxy(
      {},
      {
        get: () => {
          throw new Error('unreadable');
        },
      }
    );
    const { holder, source, laid } = chanceHolder([unreadable]);
    appWith(holder);

    expect(draw(holder)).toBe(unreadable);
    expect(Object.getOwnPropertyDescriptor(holder, CHANCE_SOURCE.key)).toEqual(laid);
    expect(sourceIn(holder)).toBe(source);
    startStoryRecording('ids--stopped');
    expect(storyRecordingOf('ids--stopped')?.blindRoads).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'recorderStopped' })])
    );
    expect(chanceEntries('ids--stopped')).toEqual([]);
  });
});
