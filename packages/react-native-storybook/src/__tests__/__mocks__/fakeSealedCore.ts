/**
 * THE CORE THE SDK SUITE RUNS AGAINST: a fake sealed core, typed against the seam. It does no walk.
 * It keeps the host it is installed with, records every call the SDK makes of it, and answers with
 * canned values - so the suite tests the SDK's side of the contract, and never runs a real core,
 * built or fetched.
 *
 * The react-native stub's loadCore hands native code's answer: the core's header line, then source
 * that makes a fresh fake (`fakeSealedCoreSource`). So the SDK evaluates, checks and installs it the
 * way an app does the shipped core, and each fresh import of the SDK gets a core of its own.
 */
import type { Metadata, SealedCore, SealedCoreHost } from '../../sealedCore/seam';

export const FAKE_CORE_VERSION = '0.0.0-fake';

export type FakeSealedCore = SealedCore & {
  /** The host the SDK installed this core with, once it has. */
  installedWith?: SealedCoreHost;
  /** Every call the SDK made of the core, in order. */
  calls: { method: keyof SealedCore; args: unknown[] }[];
};

const NO_METADATA: Metadata = { viewProps: {}, texts: [], generations: [] };

export function makeFakeSealedCore(seam: number): FakeSealedCore {
  const fake: FakeSealedCore = {
    version: FAKE_CORE_VERSION,
    seam,
    calls: [],
    install: (host) => {
      fake.calls.push({ method: 'install', args: [host] });
      fake.installedWith = host;
    },
    mergeGenerations: (roots) => {
      fake.calls.push({ method: 'mergeGenerations', args: [roots] });
      return NO_METADATA;
    },
    startTestSession: async (view) => {
      fake.calls.push({ method: 'startTestSession', args: [view] });
    },
    testStory: async (story) => {
      fake.calls.push({ method: 'testStory', args: [story] });
    },
    startStoryRenderedTracking: (channel) => {
      fake.calls.push({ method: 'startStoryRenderedTracking', args: [channel] });
      return channel !== null;
    },
    startCaptureTransport: (start) => {
      fake.calls.push({ method: 'startCaptureTransport', args: [start] });
    },
    stopCaptureTransport: () => {
      fake.calls.push({ method: 'stopCaptureTransport', args: [] });
    },
    startOpenStoryChannel: (start) => {
      fake.calls.push({ method: 'startOpenStoryChannel', args: [start] });
    },
    stopOpenStoryChannel: () => {
      fake.calls.push({ method: 'stopOpenStoryChannel', args: [] });
    },
    startWaitingAsTheApp: (start) => {
      fake.calls.push({ method: 'startWaitingAsTheApp', args: [start] });
    },
  };
  return fake;
}

// The source native code hands over runs in global scope, where it reaches the fake only through
// globalThis - as a real core reaches nothing but its host.
(globalThis as { __sherloTestMakeFakeCore?: typeof makeFakeSealedCore }).__sherloTestMakeFakeCore =
  makeFakeSealedCore;

/** A fake core of `seam`, written as native code hands it over: its header line, then its code. */
export function fakeSealedCoreSource(seam: number): string {
  return [
    `// sherlo-core {"version":"${FAKE_CORE_VERSION}","seam":${seam}}`,
    `globalThis.__SHERLO_CORE__ = globalThis.__sherloTestMakeFakeCore(${seam});`,
  ].join('\n');
}
