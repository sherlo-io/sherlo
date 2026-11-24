/**
 * The recorder (metro/polyfill.js) installs on the phone alone. The quick check replays the same
 * bundle, the polyfill in it, and its Sherlo module says `isReplay` in its constants, which a phone
 * never sets: there the recorder installs nothing, so it never walks the replay's own globals and
 * stand-ins, whose reads the replay would then have to answer.
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

// A phone-like load in testing mode: a native global, a native module the bundle looks up and
// calls, and Sherlo's module saying `sdkConstants` beside the mode. What the story then holds.
function loadAndCall(sdkConstants?: Record<string, unknown>) {
  const logger = nativeFunction((text: string) => `logged ${text}`);
  const clipboard = { getString: () => 'copied' };
  const app = startAppIn(
    'testing',
    'new',
    { nativeLogger: logger, nativeModulesOfTheTest: { Clipboard: clipboard } },
    { sdkConstants }
  );
  runFile(app, FABRIC_RENDERER, rendererSource);
  const looked = runFile(app, TURBO_MODULE_REGISTRY, registrySource).get('Clipboard');
  startStoryRecording('notes--copied');
  expect(looked.getString()).toBe('copied');
  expect(app.fakeGlobal.nativeLogger('hi')).toBe('logged hi');
  return { app, logger, looked, clipboard, recording: storyRecordingOf('notes--copied') };
}

// The recorder as it installs on a phone: it stands in for the native global and the module and
// writes down the call.
function expectRecordedAsOnAPhone(loaded: ReturnType<typeof loadAndCall>) {
  expect(loaded.app.fakeGlobal.__sherloNativeRecorder).toBeDefined();
  expect(loaded.app.fakeGlobal.nativeLogger).not.toBe(loaded.logger);
  expect(loaded.looked).not.toBe(loaded.clipboard);
  expect(loaded.recording?.nativeCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ module: 'Clipboard', method: 'getString', answer: 'copied' }),
      expect.objectContaining({ module: 'nativeLogger', method: 'apply', answer: 'logged hi' }),
    ])
  );
}

describe('the recorder in the quick check replay', () => {
  it('a recorder whose Sherlo module says it replays installs nothing, wraps nothing and records nothing', () => {
    const loaded = loadAndCall({ isReplay: true });

    expect(loaded.app.fakeGlobal.__sherloNativeRecorder).toBeUndefined();
    expect(loaded.app.fakeGlobal.__sherloNativeRoad).toBeUndefined();
    // The bundle holds the very values native gave, never a stand-in.
    expect(loaded.app.fakeGlobal.nativeLogger).toBe(loaded.logger);
    expect(loaded.looked).toBe(loaded.clipboard);
    expect(loaded.recording).toBeUndefined();
  });

  it('a recorder whose Sherlo module says nothing of a replay installs and records as on a phone', () => {
    expectRecordedAsOnAPhone(loadAndCall());
  });

  it('a recorder whose Sherlo module says it does not replay installs and records as on a phone', () => {
    expectRecordedAsOnAPhone(loadAndCall({ isReplay: false }));
  });
});
