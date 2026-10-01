/**
 * THE SCRAMBLED CORE IS NOT SLOWER WHERE A CAPTURE POLLS IT.
 *
 * A capture polls two things every 10 ms while it waits for a story: the app's reading of its
 * views (the metadata walk, `mergeGenerations`, which the SDK's MetadataProvider calls through the
 * core) and the inspector's tree (each answer checked by the capture driver for the story's own
 * views). The scrambler can make code slower - every name it hides becomes a lookup - so each
 * polled path is timed here twice, on the core's own source and on the built, scrambled core, over
 * the same app. A path the scrambler makes slower by more than half fails this file; the cure is
 * lighter scrambling for the functions on that path (see build.js).
 *
 * Each path is timed as the fastest of several runs, so a busy machine cannot make it look slower
 * than it is; the numbers are printed for the record.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  CapturedAnswer,
  CaptureTransport,
  InspectorData,
  SealedCore,
  SealedCoreHost,
  WalkedFiber,
} from '../../../react-native-storybook/src/sealedCore/seam';
import { sealedCoreFile } from '../build.js';
import { installHost } from '../src/host';
import { mergeGenerations } from '../src/metadataWalk';
import { startStoryRenderedTracking } from '../src/storyRenderedReadiness';
import { startCaptureTransport, stopCaptureTransport } from '../src/captureTransport';

/** How much slower the scrambled core may be on a polled path: half again as long, and no more. */
const MOST_IT_MAY_SLOW_DOWN = 1.5;

const STORY = 'components-list--long';

/** How many rows the story draws: a long list, so one walk of it takes long enough to time. */
const ROWS = 300;

/** The core as its source is, put together the way index.ts puts the built one together. */
const coreFromSource = {
  install: installHost,
  mergeGenerations,
  startStoryRenderedTracking,
  startCaptureTransport,
  stopCaptureTransport,
} as unknown as SealedCore;

let scrambledCore: SealedCore;

beforeAll(async () => {
  const { file } = await sealedCoreFile();
  const body = file.slice(file.indexOf('\n') + 1);
  const theGlobal: { __SHERLO_CORE__?: SealedCore } = {};
  // The SDK evaluates the core in global scope; this is that global scope, kept to this file.
  const evaluating = performance.now();
  new Function('globalThis', body).call(theGlobal, theGlobal);
  const evaluatedInMs = performance.now() - evaluating;
  scrambledCore = theGlobal.__SHERLO_CORE__!;
  console.log(
    `the built core: ${Buffer.byteLength(file)} bytes, evaluated in ${evaluatedInMs.toFixed(2)} ms`
  );
}, 60_000);

afterEach(() => {
  vi.useRealTimers();
});

describe('the scrambled core is as fast as its source where a capture polls it', () => {
  it("the metadata walk of the app's fibers", async () => {
    const times = await timeOnBoth(async (core) => {
      for (let walk = 0; walk < 20; walk++) core.mergeGenerations([THE_APPS_FIBERS]);
    });

    expect(times.scrambled).toBeLessThanOrEqual(times.source * MOST_IT_MAY_SLOW_DOWN);
  });

  it("the check of every tree the inspector answers while a capture waits for the story's views", async () => {
    // The inspector never grows the story's views, so the capture checks its answer every 10 ms for
    // its whole 15 seconds - 1,500 checks of the app's whole window - and then gives up.
    for (const core of [coreFromSource, scrambledCore]) {
      core.install(hostOverTheApp(THE_WINDOW_WITHOUT_THE_STORY));
    }

    const times = await timeOnBoth(async (core) => {
      const answer = await captureOnceOnAFakeClock(core);
      if (answer.kind !== 'crashed') throw new Error('the capture was meant to give up');
    });

    expect(times.scrambled).toBeLessThanOrEqual(times.source * MOST_IT_MAY_SLOW_DOWN);
  });
});

/* ========================================================================== */

/** Time `run` on both cores, warmed first, as the fastest of several runs; print both. */
async function timeOnBoth(
  run: (core: SealedCore) => Promise<void>
): Promise<{ source: number; scrambled: number }> {
  const RUNS = 7;
  await run(coreFromSource);
  await run(scrambledCore);

  let source = Infinity;
  let scrambled = Infinity;
  for (let round = 0; round < RUNS; round++) {
    source = Math.min(source, await millisecondsOf(() => run(coreFromSource)));
    scrambled = Math.min(scrambled, await millisecondsOf(() => run(scrambledCore)));
  }

  const name = expect.getState().currentTestName;
  console.log(
    `${name}: source ${source.toFixed(2)} ms, scrambled ${scrambled.toFixed(2)} ms ` +
      `(${(scrambled / source).toFixed(2)}x)`
  );
  return { source, scrambled };
}

async function millisecondsOf(run: () => Promise<void>): Promise<number> {
  const startedAt = performance.now();
  await run();
  return performance.now() - startedAt;
}

/**
 * Ask `core` for one capture of the story, on a clock the test runs, and hand back its answer. The
 * clock is fake so the 10 ms between two checks costs nothing: what is timed is the checking.
 */
async function captureOnceOnAFakeClock(core: SealedCore): Promise<CapturedAnswer> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const channel = storybookChannel();
  // Storybook already said the story rendered, so the capture goes straight to its waits.
  core.startStoryRenderedTracking(channel);
  channel.emit('storyRendered', STORY);

  const answered = new Promise<CapturedAnswer>((resolve) => {
    const capture: CaptureTransport = {
      waitForACapture: async ({ answer }) => {
        if (!answer) return { storyId: STORY, settings: {} };
        core.stopCaptureTransport();
        resolve(answer);
        return new Promise<never>(() => {});
      },
    };
    core.startCaptureTransport({ view: STORYBOOK_VIEW, channel, capture });
  });

  await vi.runAllTimersAsync();
  const answer = await answered;
  vi.useRealTimers();
  return answer;
}

/* ========================================================================== */
/* One app: a long list, as its fibers, its reading and the inspector's tree   */
/* ========================================================================== */

/** The app's fibers: the view Storybook wraps the story in, then ROWS rows of a view and a text. */
function fibersOfTheApp(): WalkedFiber {
  const storyRoot: WalkedFiber = {
    type: 'RCTView',
    stateNode: { _nativeTag: 2 },
    pendingProps: { testID: STORY, style: { flex: 1 } },
    memoizedProps: {},
  };
  let previousRow: WalkedFiber | undefined;
  for (let row = 0; row < ROWS; row++) {
    const text: WalkedFiber = {
      type: 'RCTText',
      stateNode: { _nativeTag: rowTextTag(row) },
      pendingProps: { children: ['Row ', row, ' of the list'], numberOfLines: 1 },
      memoizedProps: {},
    };
    const view: WalkedFiber = {
      type: 'RCTView',
      stateNode: { _nativeTag: rowViewTag(row) },
      pendingProps: { style: [{ padding: 8 }, { margin: row % 4 }], testID: `row-${row}` },
      memoizedProps: {},
      child: text,
    };
    const component: WalkedFiber = {
      type: { name: 'ListRow' },
      pendingProps: { label: `Row ${row}` },
      memoizedProps: {},
      child: view,
    };
    if (previousRow) previousRow.sibling = component;
    else storyRoot.child = component;
    previousRow = component;
  }
  return {
    type: { name: 'LongList' },
    pendingProps: {},
    memoizedProps: {},
    child: storyRoot,
  };
}

function rowViewTag(row: number): number {
  return 10 + row * 2;
}

function rowTextTag(row: number): number {
  return 11 + row * 2;
}

/**
 * The inspector's tree of the same app, with the view Storybook wraps the story in left out: the
 * rows hang straight off the window, so no answer ever holds the story's own root.
 */
function windowWithoutTheStory(): InspectorData {
  const node = (className: string, id: number, children: unknown[]) => ({
    id,
    className,
    isVisible: true,
    x: 0,
    y: id,
    width: 1080,
    height: 120,
    children,
  });
  const rows = Array.from({ length: ROWS }, (_, row) =>
    node('ReactViewGroup', rowViewTag(row), [node('ReactTextView', rowTextTag(row), [])])
  );
  return {
    viewHierarchy: node('ReactViewGroup', 1, rows),
    density: 3,
    fontScale: 1,
  } as unknown as InspectorData;
}

const THE_APPS_FIBERS = fibersOfTheApp();
const THE_APPS_READING = mergeGenerations([THE_APPS_FIBERS]);
const THE_WINDOW_WITHOUT_THE_STORY = windowWithoutTheStory();

const STORYBOOK_VIEW = { _storyIndex: { entries: { [STORY]: {} } } } as never;

/** Storybook's channel, as much of it as the core listens to. */
function storybookChannel() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    on: (event: string, listener: (...args: unknown[]) => void) => {
      (listeners[event] ||= []).push(listener);
    },
    off: () => {},
    emit: (event: string, ...args: unknown[]) => {
      (listeners[event] || []).forEach((listener) => listener(...args));
    },
  };
}

/** A host over the app: the story was handed over at boot, and the inspector answers `tree`. */
function hostOverTheApp(tree: InspectorData): SealedCoreHost {
  const config = {
    stabilization: {
      requiredMatches: 3,
      minScreenshotsCount: 3,
      intervalMs: 500,
      timeoutMs: 5000,
      threshold: 0,
      includeAA: true,
    },
  };
  return {
    native: {
      getMode: () => 'testing',
      getConfigOrDefault: () => config,
      getLastState: () => ({ nextSnapshot: { storyId: STORY } }),
      awaitFrameCommit: async () => true,
      stabilize: async () => true,
      isScrollable: async () => ({ scrollable: false }),
      getInspectorData: async () => tree,
    },
    collectAppMetadata: () => THE_APPS_READING,
    providerFirstRenderedAt: () => undefined,
    storyOfTheAppFiber: () => THE_APPS_FIBERS,
    storyErrors: {
      read: () => undefined,
      record: () => {},
      clear: () => {},
      fallbackText: 'Something went wrong rendering your story',
    },
    activateMocksForStory: () => null,
    clearMocks: () => {},
    bundlerOrigin: () => null,
    setCaptureLogSink: () => {},
    warn: () => {},
  } as unknown as SealedCoreHost;
}
