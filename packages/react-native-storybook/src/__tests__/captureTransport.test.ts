/**
 * THE APP'S HALF OF THE CAPTURE SOCKET - the JavaScript that walks one story for `sherlo capture`.
 *
 * One fact per describe:
 *
 *   - the walk IS the test-run walk: put the story on screen through Storybook's own channel, wait
 *     for STORY_RENDERED, close the last-frame gap, stabilize, and read the view tree. Told and
 *     answered over a socket instead of the runner's files, and that is the whole of the difference -
 *     including that the stabilization numbers the tool hands over are the ones used.
 *   - the tree STARTS where the run's tree starts: at the view Storybook wraps the story in, not at
 *     the app's window.
 *   - the primitive is ONE OF THE WORDS THE SCREEN PRINTS, whatever class the view was drawn by.
 *   - the two facts beside the tree - how many screenfuls the story is, and whether an image in it
 *     is loaded over the network - are read where the run reads them.
 *   - a capture restarts the app into testing mode, which is what makes isRunningVisualTests true
 *     for the story it records - and, when the relay handed one over, that restart carries the
 *     story to land on directly.
 *   - no test-run artifact is ever written: this road never appends to or reads a file.
 *   - a walk that throws is the crash ending, and the app says what threw.
 *
 * The bundler is injected as a `capture` (a CaptureTransport), the same way openStoryChannel.test.ts
 * injects the letterbox, so no real socket or NativeModules source is needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetMode,
  mockGetConfigOrDefault,
  mockStabilize,
  mockAwaitFrameCommit,
  mockGetInspectorData,
  mockIsScrollable,
  mockScrollToCheckpoint,
  mockOpenTesting,
  mockAppendFile,
  mockReadFile,
  mockGetLastState,
} = vi.hoisted(() => ({
  mockGetMode: vi.fn(),
  mockGetConfigOrDefault: vi.fn(),
  mockStabilize: vi.fn(),
  mockAwaitFrameCommit: vi.fn(),
  mockGetInspectorData: vi.fn(),
  mockIsScrollable: vi.fn(),
  mockScrollToCheckpoint: vi.fn(),
  mockOpenTesting: vi.fn(),
  mockAppendFile: vi.fn(),
  mockReadFile: vi.fn(),
  mockGetLastState: vi.fn(),
}));

vi.mock('../SherloModule', () => ({
  default: {
    getMode: mockGetMode,
    // The capture road never calls the throwing getConfig() - only the non-throwing
    // getConfigOrDefault, which falls back to the SDK's own defaults when there is nothing on
    // disk to read (see the describe below named for exactly that case).
    getConfigOrDefault: mockGetConfigOrDefault,
    stabilize: mockStabilize,
    awaitFrameCommit: mockAwaitFrameCommit,
    getInspectorData: mockGetInspectorData,
    isScrollable: mockIsScrollable,
    scrollToCheckpoint: mockScrollToCheckpoint,
    openTesting: mockOpenTesting,
    appendFile: mockAppendFile,
    readFile: mockReadFile,
    // Read by describeStorybookState's own diagnostic (see the crash-message describe below) the
    // same way TestingMode/Storybook.tsx reads it into initialSelection - undefined by default,
    // the state of an app whose restart handed no story over.
    getLastState: mockGetLastState,
  },
}));

import {
  startCaptureTransport,
  stopCaptureTransport,
  type CaptureTransport,
  type CapturedAnswer,
} from '../captureTransport';
import { __resetStoryRenderedTrackingForTests } from '../getStorybook/components/TestingMode/useTestAllStories/storyRenderedReadiness';
import {
  __resetProviderFirstRenderedAtForTests,
  rememberAppMetadataCollector,
} from '../appMetadata';
import { rememberStoryOfTheApp } from '../componentNames';
import { clearStoryError, recordStoryError } from '../getStorybook/storyErrorRegistry';
import { STORY_ERROR_FALLBACK_TEXT } from '../constants';
import RunnerBridge from '../helpers/RunnerBridge';
import { NativeModules } from 'react-native';

const STORY = 'components-button--primary';

/** The app's own config, read for the story-rendered timeout and for the values the tool leaves out. */
const CONFIG = {
  stabilization: {
    requiredMatches: 5,
    minScreenshotsCount: 8,
    intervalMs: 1000,
    timeoutMs: 30000,
    threshold: 0.2,
    includeAA: false,
  },
  storyRenderedTimeoutMs: 5000,
  paintBarrierTimeoutMs: 1000,
};

/**
 * What getConfigOrDefault answers with when nothing was ever written to the device - the same
 * numbers the SDK falls back to when it is not wired into a build at all (see DEFAULT_CONFIG in
 * ../SherloModule). A capture's freshly-restarted app finds exactly this: no config.sherlo, because
 * a capture writes nothing to the device before asking for the restart.
 */
const CONFIG_WHEN_NOTHING_IS_ON_DISK = {
  stabilization: {
    requiredMatches: 3,
    minScreenshotsCount: 3,
    intervalMs: 500,
    timeoutMs: 5000,
    threshold: 0.0,
    includeAA: true,
  },
  storyRenderedTimeoutMs: 5000,
  paintBarrierTimeoutMs: 1000,
};

/**
 * What the tool hands over with the story. Every number differs from the app's own config, so a walk
 * that used the config instead of what it was handed would be caught here - including the two that
 * decide whether the screen counts as settled, which is what the ending itself turns on.
 */
const STABILIZATION_SETTINGS = {
  requiredMatches: 2,
  minScreenshotsCount: 4,
  intervalMs: 250,
  timeoutMs: 9000,
  threshold: 0.02,
  includeAA: true,
};

/**
 * The story's whole window, as the inspector answers it on Android.
 *
 * The window holds more than the story: Sherlo's own frame and Storybook's, and the view Storybook
 * wraps a story in (id 3) - which is the view a test run's tree starts at, because it is the one
 * carrying the story's own id. The story itself is what hangs under it.
 *
 * Android is the interesting platform to draw this on: it names its views after the Java class that
 * draws them, so a class here is a class the screen never prints.
 */
const INSPECTOR_DATA = {
  viewHierarchy: node('ReactViewGroup', 1, [
    node('ReactViewGroup', 2, [
      node('ReactViewGroup', 3, [node('ReactScrollView', 4, [node('ReactTextView', 5, [])])]),
    ]),
  ]),
  density: 3,
  fontScale: 1,
};

/**
 * The same views as the renderer that drew them reads them, by native tag: the class each fiber drew
 * its view by, and the story id on the view Storybook wraps a story in.
 *
 * The class comes from the fiber rather than from the platform, which is why `RCTScrollView` stands
 * where the inspector said `ReactScrollView` - and why ids 1-5 are the native tags the inspector
 * reports for the same views, since that is how a view is matched to its own reading.
 */
const VIEW_METADATA = {
  viewProps: {
    1: { className: 'RCTView' },
    2: { className: 'RCTView' },
    3: { className: 'RCTView', testID: STORY },
    4: { className: 'RCTScrollView' },
    5: { className: 'RCTText' },
  },
  texts: [],
};

/**
 * The fibers the story was rendered from, host views included - what the app's component names are
 * read off (../componentNames). The two host fibers carry the native tags the inspector reports.
 */
const TEXT_HOST = { type: 'RCTText', stateNode: { _nativeTag: 5 } };
const SECTION_TITLE = { type: { name: 'SectionTitle' }, child: TEXT_HOST };
const SCROLL_HOST = { type: 'RCTScrollView', stateNode: { _nativeTag: 4 }, child: SECTION_TITLE };
const TYPOGRAPHY_SCALES = { type: { name: 'TypographyScales' }, child: SCROLL_HOST };
const THE_STORY = { type: { name: 'Scales' }, child: TYPOGRAPHY_SCALES };

/** The box every `node()` above is drawn in, in pixels - and the same box in points, at density 3. */
const BOX_IN_PIXELS = { x: 0, y: 0, width: 390, height: 844 };
const BOX_IN_POINTS = { width: 130, height: 281 };

/**
 * What the app records of this story: the view Storybook wraps the story in comes first, then the
 * story as the app renders it. The two views above Storybook's are gone, and the story's own root is
 * one line in - carrying the testID that matched it, the same one VIEW_METADATA gave its view.
 */
const RECORDED_TREE = {
  primitive: 'View',
  components: [],
  visible: true,
  ...BOX_IN_PIXELS,
  size: BOX_IN_POINTS,
  testID: STORY,
  children: [
    {
      primitive: 'ScrollView',
      components: ['TypographyScales'],
      visible: true,
      ...BOX_IN_PIXELS,
      size: BOX_IN_POINTS,
      children: [
        {
          primitive: 'Text',
          components: ['SectionTitle'],
          visible: true,
          ...BOX_IN_PIXELS,
          size: BOX_IN_POINTS,
          children: [],
        },
      ],
    },
  ],
};

/**
 * The same window, with the names the app published for its views - what a capture records when the
 * story on screen is broken.
 *
 * A broken story is re-rooted by nobody, but it is still named where the app named it: the component
 * names come from the capture's own reading of the fibers, which is not the step a run skips. The
 * PRIMITIVES do not: a run never enhances a broken story's reading either (useTestStory.tsx calls
 * prepareInspectorData only when the story does not contain an error), so no fiber is ever matched to
 * any view here - every primitive is the view's own native drawing class, unguessed, and none of them
 * carry a style or a testID.
 */
const THE_WHOLE_WINDOW_NAMED_BY_THE_APP = {
  primitive: 'ReactViewGroup',
  components: [],
  visible: true,
  ...BOX_IN_PIXELS,
  size: BOX_IN_POINTS,
  children: [
    {
      primitive: 'ReactViewGroup',
      components: [],
      visible: true,
      ...BOX_IN_PIXELS,
      size: BOX_IN_POINTS,
      children: [
        {
          primitive: 'ReactViewGroup',
          components: [],
          visible: true,
          ...BOX_IN_PIXELS,
          size: BOX_IN_POINTS,
          children: [
            {
              primitive: 'ReactScrollView',
              components: ['TypographyScales'],
              visible: true,
              ...BOX_IN_PIXELS,
              size: BOX_IN_POINTS,
              children: [
                {
                  primitive: 'ReactTextView',
                  components: ['SectionTitle'],
                  visible: true,
                  ...BOX_IN_PIXELS,
                  size: BOX_IN_POINTS,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** One screenful: the story is exactly as tall as the screen it is drawn in. */
const ONE_SCREENFUL = {
  reachedBottom: true,
  appliedIndex: 0,
  appliedOffsetPx: 0,
  viewportPx: 800,
  contentPx: 800,
};

/** A story three screens tall, as the scroll view it is drawn in measures it. */
const THREE_SCREENFULS = { ...ONE_SCREENFUL, contentPx: 2400 };

/** What the app says about itself every time it asks the bundler. */
type Saying = { mode: string; stories: string[]; answer: CapturedAnswer | null };

/** The story the app recorded, once it recorded one. */
type CapturedStory = Extract<CapturedAnswer, { kind: 'captured' }>;

/**
 * A published reading that exists but is not about this story - the screen the app rendered before
 * the one this capture asked for. None of its native tags overlap the inspector's (1-5), and its one
 * view carries a different testID, so prepareInspectorData can neither re-root the tree with it nor
 * name any view in it: a poll that accepted this reading as "good enough" would record the window.
 */
const METADATA_OF_A_DIFFERENT_SCREEN = {
  viewProps: {
    99: { className: 'RCTView', testID: 'components-splash--default' },
  },
  texts: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetStoryRenderedTrackingForTests();
  mockGetMode.mockReturnValue('testing');
  mockGetConfigOrDefault.mockReturnValue(CONFIG);
  mockStabilize.mockResolvedValue(true);
  mockAwaitFrameCommit.mockResolvedValue(true);
  mockGetInspectorData.mockResolvedValue(INSPECTOR_DATA);
  // By default the story fits the screen it is drawn in: nothing scrolls, and nothing carries an
  // image loaded over the network.
  mockIsScrollable.mockResolvedValue({ scrollable: false });
  mockScrollToCheckpoint.mockResolvedValue(ONE_SCREENFUL);
  // No story handed over unless a test says otherwise - see "the crash carries what Storybook
  // itself was doing" below for the case where one was.
  mockGetLastState.mockReturnValue(undefined);
  // The provider has not rendered at all yet, unless a test says otherwise below - the fresh-boot
  // state `__resetProviderFirstRenderedAtForTests` names.
  __resetProviderFirstRenderedAtForTests();
  // The app on screen published its own reading of its views, as it does whenever it renders under
  // the metadata provider a test run and a capture share.
  rememberAppMetadataCollector(() => VIEW_METADATA);
  rememberStoryOfTheApp(THE_STORY);
});

afterEach(() => {
  stopCaptureTransport();
  __resetStoryRenderedTrackingForTests();
  rememberStoryOfTheApp(undefined);
  rememberAppMetadataCollector(undefined);
  __resetProviderFirstRenderedAtForTests();
  // The registry is a module-level map the whole app shares, so a test that records an error has to
  // take it back out again or every test after it walks a story that is already broken.
  clearStoryError(STORY);
});

describe('a capture walks the same story path a test run does', () => {
  it('puts the story on screen, stabilizes with the numbers it was handed, and reads the tree', async () => {
    const { answered, channel, asked } = startTheRoad();

    // The story is put on screen through Storybook's own channel, then reported rendered.
    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );
    channel.emit('storyRendered', STORY);

    const answer = await answered;

    // The same path a test run walks - told by name over the socket, answered over the same socket.
    expect(asked[0]).toEqual({ mode: 'testing', stories: [STORY], answer: null });
    expect(mockAwaitFrameCommit).toHaveBeenCalledWith(1000);
    // The tool's numbers, not the app's own: the config supplies only what the tool left out. The last
    // two matter as much as the timings - they decide whether the screen counts as settled at all, so
    // a capture that read them off the app could call a story never-settled that a run settles.
    expect(mockStabilize).toHaveBeenCalledWith(2, 4, 250, 9000, false, 0.02, true);
    expect(mockGetInspectorData).toHaveBeenCalled();
    expect(answer).toEqual({
      kind: 'captured',
      storyId: STORY,
      settled: { ms: expect.any(Number), frames: 4 },
      parts: 1,
      hasNetworkImage: false,
      density: 3,
      fontScale: 1,
      tree: RECORDED_TREE,
      // Both waits are settled the first time this story's own reading and tree are checked - see
      // "a capture reports how each of its waits ended" below for what each of the other endings
      // looks like.
      waited: {
        metadata: { outcome: 'first-check', ms: expect.any(Number) },
        storyViews: { outcome: 'first-check', ms: expect.any(Number), rereads: 0 },
      },
      root: { at: 'story', nodeCount: 3 },
    });
  });

  it('falls back to the app config for every number the tool did not send', async () => {
    await walkOneStory({ requiredMatches: 2 });

    // The tool sends what it has; what it does not send is not replaced with the runner's numbers or
    // any other guess. The app answers for those itself, which is what an app does when a run leaves
    // a value out - so a setting the tool never mentioned cannot silently become a runner default.
    expect(mockStabilize).toHaveBeenCalledWith(2, 8, 1000, 30000, false, 0.2, false);
  });
});

describe("a capture pushes the app's own log lines live, as they are formed", () => {
  const ORIGIN = 'http://localhost:8081';

  beforeEach(() => {
    // log() reads __DEV__ to decide whether to also print to the system console (see
    // ../helpers/RunnerBridge/actions/log.ts) - a real React Native global this test environment
    // never defines.
    vi.stubGlobal('__DEV__', true);
    // bundlerOrigin() reads this to resolve the address a capture pushes to - unset by the shared
    // react-native mock, so every OTHER test in this file still finds no origin and pushes nothing.
    NativeModules.SourceCode = {
      getConstants: () => ({ scriptURL: `${ORIGIN}/index.bundle?platform=ios` }),
    };
  });

  afterEach(() => {
    delete NativeModules.SourceCode;
  });

  it("posts each line to the bundler's own live feed the instant RunnerBridge.log forms it - not carried home inside the capture's own answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { channel, answered } = startTheRoad();

    RunnerBridge.log('storybook style', { style: 'dark' });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/sherlo/capture-log`);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    // The exact line log() forms for the file sink - a time, the key, and the parameters as JSON.
    expect(body.line).toMatch(/^\d{2}:\d{2}:\d{2}: storybook style : \{"style":"dark"\}$/);

    // Let the walk finish cleanly rather than leave it hanging past this test.
    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );
    channel.emit('storyRendered', STORY);
    const answer = await answered;

    // The push is a separate channel from the answer, exactly the point of pushing live: nothing
    // about it rides inside a payload that a hang or a crash could keep from ever being sent.
    expect(answer).not.toHaveProperty('logs');
  });

  it('stops pushing once the transport is stopped', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    // Both calls are synchronous, and so is the assertion below: collectCaptures cannot have
    // resumed past its first await yet, so this proves the sink was cleared before the walk ever
    // got a chance to use it - not merely that it stopped being used once the walk was done.
    startTheRoad();
    stopCaptureTransport();

    RunnerBridge.log('after stop');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the app that comes back from the restart is told which story to show', () => {
  it('re-tells the app once its own default selection has overwritten the first telling, and does not stop until the story it asked for is the one that actually rendered', async () => {
    // A capture's restarted app has no `initialSelection` to land on (see the file header), so
    // Storybook resolves its OWN default selection to get somewhere. The first
    // `setCurrentStory` this test's road sends can lose that race - which looks, from here, exactly
    // like silence: no storyRendered arrives for it, not ever, not because nothing happened but
    // because the app's own default selection undid it. A single telling that only waits would end
    // exactly where the real device did: the story browser's own empty state, `storyRendered` never
    // fired.
    const { answered, channel } = startTheRoad();

    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );
    // Nothing answers the first telling - the same silence a lost race leaves behind on a real
    // device. If the app only asked once, it would still be asleep waiting for a render that is
    // never coming for this asking.

    // The retry lands after whatever was racing it the first time has already settled, so this
    // second telling has nothing left to lose to - and this time the app reports it rendered.
    await vi.waitFor(
      () =>
        expect(channel.emitted('setCurrentStory')).toEqual([
          { storyId: STORY },
          { storyId: STORY },
        ]),
      { timeout: 2000 }
    );
    channel.emit('storyRendered', STORY);

    const answer = await answered;
    if (answer.kind !== 'captured') throw new Error(`the story was not captured: ${answer.kind}`);

    // The capture recorded the story it asked for - not whichever story the app's own default
    // selection landed on, and not a crash for a story that eventually did render, just not on the
    // first asking.
    expect(answer.tree).toEqual(RECORDED_TREE);
  });
});

describe("a capture's first story appears even though the app booted onto a story of its own choosing", () => {
  it('keeps re-telling the app through a run of silence, not just one lost race, until the story it asked for renders', async () => {
    // A capture's restart has no real story to hand over as `initialSelection`, so Storybook's own
    // preview is resolving its OWN default selection at the same time this road starts telling it
    // which story to show - and that default selection can keep the channel silent for more than
    // one retry interval before it settles (see Storybook.tsx: the fix this test covers is what that
    // default selection resolves to, not this file - this road only has to prove the retry survives
    // however long that silence runs). Four tellings pass with no answer at all, not the single lost
    // race the test above covers, before the fifth is finally the one Storybook renders.
    const { answered, channel } = startTheRoad();

    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );

    await vi.waitFor(
      () =>
        expect(channel.emitted('setCurrentStory')).toEqual([
          { storyId: STORY },
          { storyId: STORY },
          { storyId: STORY },
          { storyId: STORY },
          { storyId: STORY },
        ]),
      { timeout: 3000 }
    );
    channel.emit('storyRendered', STORY);

    const answer = await answered;
    if (answer.kind !== 'captured') throw new Error(`the story was not captured: ${answer.kind}`);

    // The first story of the session is the one on screen at the end - not the empty state a
    // placeholder that never resolves to a real story would have left behind forever.
    expect(answer.tree).toEqual(RECORDED_TREE);
  });
});

describe('a capture needs no config on disk to walk a story', () => {
  it('a capture answers from an app that came back into testing mode with nothing on its disk', async () => {
    // A capture writes nothing to the device before asking for the restart into testing mode (see
    // "a capture reads and writes nothing in the device's storage" below), so the app that comes
    // back finds no config.sherlo. getConfigOrDefault answers with the SDK's own defaults rather
    // than throwing - this is what that absence looks like on the capture road.
    mockGetConfigOrDefault.mockReturnValue(CONFIG_WHEN_NOTHING_IS_ON_DISK);

    // The tool sends no numbers of its own either, so every one of them has to come from the
    // fallback - there is nowhere else left for them to come from.
    const answer = await walkOneStory({});

    // The walk completed and answered the tool, rather than dying under the transport the way it
    // did before the restart could come back alive.
    expect(answer.kind).toBe('captured');
    expect(mockStabilize).toHaveBeenCalledWith(3, 3, 500, 5000, false, 0.0, true);
  });
});

describe("the tree a capture records starts where a test run's tree starts", () => {
  it('starts at the view Storybook wraps the story in, not at the app window', async () => {
    const answer = await walkOneStory();

    // Storybook wraps every story in a view carrying the story's own id, and that view is what a
    // test run hands its tree to the runner: the app records from there, so the window above it -
    // Sherlo's frame, Storybook's - is left out of the record.
    expect(answer.tree).toEqual(RECORDED_TREE);
  });

  it('fails loudly rather than recording the window, when nothing rendered this app the way a run renders it', async () => {
    rememberAppMetadataCollector(undefined);
    __resetProviderFirstRenderedAtForTests();
    rememberStoryOfTheApp(undefined);

    const answer = await answerOneStory();

    // No view ever carried a story id, so the load-bearing gate never cleared: the capture must not
    // photograph the app's window and call it the story - it crashes instead, the way a failed
    // inspector walk already does.
    expect(answer.kind).toBe('crashed');
  }, 20000);

  it("the first capture after the restart starts at the story's own root, not at the app window", async () => {
    // The app publishes its view metadata (../appMetadata) from an effect that runs once the app
    // has rendered. On a real device, the FIRST capture after a restart can reach the inspector
    // before that effect has had its turn - the seam is still unpublished the instant Storybook
    // reports the story rendered, and arrives a beat later, the way a pending effect does.
    rememberAppMetadataCollector(undefined);
    __resetProviderFirstRenderedAtForTests();

    const { answered, channel } = startTheRoad();
    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );
    channel.emit('storyRendered', STORY);

    setTimeout(() => rememberAppMetadataCollector(() => VIEW_METADATA), 20);

    const answer = await answered;
    if (answer.kind !== 'captured') throw new Error(`the story was not captured: ${answer.kind}`);

    // The metadata arrived a beat late, not never - so the walk still starts at the view Storybook
    // wraps the story in, the same root every later capture in the session starts at, rather than
    // mistaking the pending effect for an app that rendered nothing.
    expect(answer.tree).toEqual(RECORDED_TREE);
  });

  it('a capture waits for the reading that names its own story, not merely for a reading to exist', async () => {
    // A reading is already published the instant the story is asked for - but it is a reading of the
    // screen the app booted into, not of this story. A wait that stopped on existence alone would
    // accept it immediately and never see the reading that actually names STORY.
    rememberAppMetadataCollector(() => METADATA_OF_A_DIFFERENT_SCREEN);

    const { answered, channel } = startTheRoad();
    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );
    channel.emit('storyRendered', STORY);

    // The story's own reading arrives a beat later, replacing the one of the wrong screen - the way
    // a real device's effect catches up once the story is actually drawn into what it reads.
    setTimeout(() => rememberAppMetadataCollector(() => VIEW_METADATA), 20);

    const answer = await answered;
    if (answer.kind !== 'captured') throw new Error(`the story was not captured: ${answer.kind}`);

    // The wait outlasted the reading that named the wrong story and kept polling until one named
    // STORY - so the walk starts at the view Storybook wraps the story in, not at the app's window.
    expect(answer.tree).toEqual(RECORDED_TREE);
  });

  it("a capture waits for the story's own views to be in the tree, not just for the app to say it rendered", async () => {
    // The app's own reading already names STORY on the very first check (VIEW_METADATA is remembered
    // in beforeEach, unlike the two tests above). But the inspector's OWN tree - the native view
    // hierarchy, a different clock - still answers with the app's shell alone: node 3, the view
    // Storybook wraps the story in, has not mounted yet. A metadata match is not proof the native
    // tree has caught up to it.
    const THE_APPS_SHELL = {
      viewHierarchy: node('ReactViewGroup', 1, [node('ReactViewGroup', 2, [])]),
      density: 3,
      fontScale: 1,
    };
    mockGetInspectorData.mockResolvedValueOnce(THE_APPS_SHELL);
    mockGetInspectorData.mockResolvedValueOnce(THE_APPS_SHELL);

    const answer = await walkOneStory();

    // The inspector was asked more than once - not accepted on its first, story-less answer just
    // because the metadata already named the story - and the tree finally recorded is the story's
    // own, not the shell a single, unwaited read would have recorded.
    expect(mockGetInspectorData.mock.calls.length).toBeGreaterThan(1);
    expect(answer.tree).toEqual(RECORDED_TREE);
  });
});

describe('a capture reports how each of its waits ended, not only what it recorded', () => {
  it('reports both waits as settled on the first check, and the tree as rooted at the story', async () => {
    // Nothing here makes either wait poll: VIEW_METADATA already names STORY and the inspector's
    // tree already holds its views, both from the very first read (beforeEach).
    const answer = await walkOneStory();

    expect(answer.waited).toEqual({
      metadata: { outcome: 'first-check', ms: expect.any(Number) },
      storyViews: { outcome: 'first-check', ms: expect.any(Number), rereads: 0 },
    });
    // RECORDED_TREE is the story's own root (View), one ScrollView under it, one Text under that -
    // three nodes, and the one a run's tree also starts at.
    expect(answer.root).toEqual({ at: 'story', nodeCount: 3 });
  });

  it('reports the metadata wait as polled once the reading needed a beat to name the story', async () => {
    // The same race "a capture waits for the reading that names its own story" walks: a reading of
    // the wrong screen is published first, and the one naming STORY arrives 20ms later.
    rememberAppMetadataCollector(() => METADATA_OF_A_DIFFERENT_SCREEN);

    const { answered, channel } = startTheRoad();
    await vi.waitFor(() =>
      expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }])
    );
    channel.emit('storyRendered', STORY);
    setTimeout(() => rememberAppMetadataCollector(() => VIEW_METADATA), 20);

    const answer = await answered;
    if (answer.kind !== 'captured') throw new Error(`the story was not captured: ${answer.kind}`);

    expect(answer.waited.metadata.outcome).toBe('polled');
    // The wait for the story's own views did not have to poll: the inspector's tree already held
    // them the moment the (now-correct) metadata was checked against it.
    expect(answer.waited.storyViews).toEqual({
      outcome: 'first-check',
      ms: expect.any(Number),
      rereads: 0,
    });
  });

  it('reports the story-views wait as polled, and how many times the inspector was re-read', async () => {
    // The same race "a capture waits for the story's own views to be in the tree" walks: the
    // metadata already names STORY, but the inspector answers with the app's shell alone twice
    // before its tree catches up.
    const THE_APPS_SHELL = {
      viewHierarchy: node('ReactViewGroup', 1, [node('ReactViewGroup', 2, [])]),
      density: 3,
      fontScale: 1,
    };
    mockGetInspectorData.mockResolvedValueOnce(THE_APPS_SHELL);
    mockGetInspectorData.mockResolvedValueOnce(THE_APPS_SHELL);

    const answer = await walkOneStory();

    // The metadata was already there on the first check; the two false reads of the inspector are
    // what made the story-views wait poll.
    expect(answer.waited.metadata.outcome).toBe('first-check');
    expect(answer.waited.storyViews).toEqual({
      outcome: 'polled',
      ms: expect.any(Number),
      rereads: 2,
    });
    expect(answer.root).toEqual({ at: 'story', nodeCount: 3 });
  });

  it('fails loudly instead of recording the window, when no reading ever names the story', async () => {
    // Nothing ever publishes a reading that names STORY, so the load-bearing gate this task added
    // never clears - the same state "fails loudly ... when nothing rendered this app" walks, from
    // the other describe above. A capture that gave up here used to record THE_WHOLE_WINDOW; now it
    // must not - it crashes, carrying what it did (not) find.
    rememberAppMetadataCollector(undefined);
    __resetProviderFirstRenderedAtForTests();
    rememberStoryOfTheApp(undefined);

    const answer = await answerOneStory();

    expect(answer.kind).toBe('crashed');
    const crashed = answer as Extract<CapturedAnswer, { kind: 'crashed' }>;
    // The message carries the number this whole sharpening exists to produce - how long it waited -
    // and says the reading was stuck the entire time, not merely "timed out": that is what tells
    // apart a wait that was simply too short from one watching something genuinely never move.
    expect(crashed.error?.message).toContain(STORY);
    expect(crashed.error?.message).toContain('waited 15');
    expect(crashed.error?.message).toContain(
      'it never held anything at all the whole time it waited'
    );
  }, 20000);

  it('fails loudly instead of recording the window, when a reading exists but never names this story', async () => {
    // A reading is published from the very first check, but it is of a different screen than the
    // one this capture asked for, and nothing ever replaces it with one that names STORY - THE EXACT
    // RACE THIS TASK EXISTS TO CLOSE: `storyRendered` can fire while the app's own reading still
    // describes the wrong screen. The gate must not let the capture past that and record it.
    rememberAppMetadataCollector(() => METADATA_OF_A_DIFFERENT_SCREEN);

    const answer = await answerOneStory();

    expect(answer.kind).toBe('crashed');
    const crashed = answer as Extract<CapturedAnswer, { kind: 'crashed' }>;
    // The reading held SOMETHING the whole time - a different story's testID - and it never changed:
    // exactly the "held only X, unchanged" diagnosis this sharpening exists to produce, distinct from
    // "never held anything at all" above.
    expect(crashed.error?.message).toContain('waited 15');
    expect(crashed.error?.message).toContain(
      'it held only components-splash--default the whole time it waited, unchanged'
    );
  }, 20000);

  it("fails loudly instead of recording the window, when the app's reading names the story but its views never mount natively", async () => {
    // THE MEASURED BUG ITSELF: the app's own reading already names STORY - JavaScript rendered it -
    // but the native inspector's tree never grows the view it names, the way a real device's first
    // capture after a restart read a native tree with nothing of the story under it at all, even
    // though `storyRendered` had already fired. The gate must not let this past either.
    const THE_APPS_SHELL = {
      viewHierarchy: node('ReactViewGroup', 1, [node('ReactViewGroup', 2, [])]),
      density: 3,
      fontScale: 1,
    };
    mockGetInspectorData.mockResolvedValue(THE_APPS_SHELL);

    const answer = await answerOneStory();

    expect(answer.kind).toBe('crashed');
    const crashed = answer as Extract<CapturedAnswer, { kind: 'crashed' }>;
    // The measurement this task exists to produce: how long the gate waited, and that the native
    // tree held nothing of any story the whole time - "never changed at all", not a bare timeout.
    expect(crashed.error?.message).toContain('native view tree');
    expect(crashed.error?.message).toContain('waited 15');
    expect(crashed.error?.message).toContain(
      'it never held anything at all the whole time it waited'
    );
  }, 20000);

  it("says what the native tree held instead, when it holds a different story's view the whole time", async () => {
    // The metadata already names STORY, but the LIVE native tree holds some OTHER story's wrapper -
    // live, and unmoving, across the whole wait. This is the "held only X, unchanged" half of the
    // diagnosis for the native-tree failure, the same shape the metadata failure above can report.
    const A_DIFFERENT_STORYS_LIVE_WRAPPER = {
      viewHierarchy: node('ReactViewGroup', 1, [
        node('ReactViewGroup', 2, [node('ReactViewGroup', 99, [node('ReactTextView', 100, [])])]),
      ]),
      density: 3,
      fontScale: 1,
    };
    mockGetInspectorData.mockResolvedValue(A_DIFFERENT_STORYS_LIVE_WRAPPER);
    rememberAppMetadataCollector(() => ({
      viewProps: {
        ...VIEW_METADATA.viewProps,
        99: { className: 'RCTView', testID: 'components-splash--default' },
      },
      texts: [],
    }));

    const answer = await answerOneStory();

    expect(answer.kind).toBe('crashed');
    const crashed = answer as Extract<CapturedAnswer, { kind: 'crashed' }>;
    expect(crashed.error?.message).toContain(
      'it held only components-splash--default the whole time it waited, unchanged'
    );
  }, 20000);
});

describe('the crash carries what Storybook itself was doing when the gate gave up', () => {
  // Nothing ever publishes a reading that names STORY in any of these - the "never arrives" state
  // this section exists for - so every one of them takes the metadataOfTheApp branch of the gate.
  beforeEach(() => {
    rememberAppMetadataCollector(undefined);
    __resetProviderFirstRenderedAtForTests();
    rememberStoryOfTheApp(undefined);
  });

  it('says the index never finished loading, when Storybook never reports itself ready', async () => {
    // No `_ready`, no stories in the index - Storybook's own preview never got anywhere, which is
    // one of the four states this diagnostic exists to tell apart from the other three below.
    const answer = await answerOneStory(undefined, makeView({ ready: false, storyIds: [] }));

    expect(answer.kind).toBe('crashed');
    const crashed = answer as Extract<CapturedAnswer, { kind: 'crashed' }>;
    expect(crashed.error?.message).toContain(
      'Storybook itself: never reported itself ready, 0 stories in its index, and has selected no story'
    );
  }, 20000);

  it('says the index loaded onto the wrong story, when Storybook is ready but selected a different one', async () => {
    const answer = await answerOneStory(
      undefined,
      makeView({
        ready: true,
        storyIds: [STORY, 'components-splash--default'],
        selectedStoryId: 'components-splash--default',
      })
    );

    expect(answer.kind).toBe('crashed');
    const crashed = answer as Extract<CapturedAnswer, { kind: 'crashed' }>;
    expect(crashed.error?.message).toContain(
      'Storybook itself: reports itself ready, 2 stories in its index, and has selected ' +
        '"components-splash--default" instead'
    );
  }, 20000);

  it("says the right story's own render is what failed, when Storybook is ready and has this story selected", async () => {
    // Ready, the index holds this story, and Storybook even believes THIS story is selected - and
    // still no reading ever names it. That leaves only one culprit: the story function itself.
    const answer = await answerOneStory(
      undefined,
      makeView({ ready: true, storyIds: [STORY], selectedStoryId: STORY })
    );

    expect(answer.kind).toBe('crashed');
    const crashed = answer as Extract<CapturedAnswer, { kind: 'crashed' }>;
    expect(crashed.error?.message).toContain(
      'Storybook itself: reports itself ready, 1 story in its index, and has this story selected'
    );
  }, 20000);

  it('says no story was handed over at boot, when the restart carried none', async () => {
    // The default of this describe's own beforeEach (mockGetLastState answers undefined) - stated
    // explicitly here because this is the fact this test exists to check, not incidental setup.
    mockGetLastState.mockReturnValue(undefined);

    const answer = await answerOneStory(undefined, makeView({ ready: false, storyIds: [] }));

    expect(answer.kind).toBe('crashed');
    const crashed = answer as Extract<CapturedAnswer, { kind: 'crashed' }>;
    // THE ONE FACT THAT TELLS APART "the selection raced the index load" from "the restart's
    // handover is silently broken": whether SherloModule.getLastState() - the same field
    // TestingMode/Storybook.tsx reads into initialSelection - actually named a story for this boot.
    expect(crashed.error?.message).toContain(
      'the app booted with no story handed over as its initial selection'
    );
  }, 20000);

  it('names the story that was handed over at boot, when the restart carried a DIFFERENT story', async () => {
    // A different story than the one being captured, deliberately: the boot-selection story is
    // handed over as the FIRST story of a session, but this diagnostic is read for whichever story
    // is being captured right now - and when it names one this boot never selected, the app still
    // gets told to show it (see "the story a boot already selected" below for the matching case,
    // which never reaches this diagnostic because setCurrentStory is what would normally win the
    // race this test's own silence stands in for).
    mockGetLastState.mockReturnValue({
      nextSnapshot: { storyId: 'components-splash--default' },
      requestId: '',
    });

    const answer = await answerOneStory(undefined, makeView({ ready: false, storyIds: [] }));

    expect(answer.kind).toBe('crashed');
    const crashed = answer as Extract<CapturedAnswer, { kind: 'crashed' }>;
    expect(crashed.error?.message).toContain(
      'the app booted with "components-splash--default" handed over as its initial selection'
    );
  }, 20000);
});

describe('the story a boot already selected is never told again', () => {
  // waitForTheStoryOnScreen emitted SET_CURRENT_STORY unconditionally, first and on every retry,
  // with no regard for whether this exact story was the one the native side already landed
  // Storybook on at boot (SherloModule.getLastState()?.nextSnapshot.storyId - the same field
  // TestingMode/Storybook.tsx reads into initialSelection). On the first capture of a boot that
  // emit could fire while Storybook's own preview was still mid-index-load, racing the selection
  // Storybook was about to apply for itself at the end of that load - two selections, one of them
  // unasked-for. A run never takes this risk: it boots onto its story and never tells Storybook
  // again (see useTestStory.tsx's awaitStoryReadyAndPaint, which only waits). A capture now does
  // the same whenever the story it was asked for is the one already handed over.
  it('does not emit setCurrentStory when this boot already selected the story being captured', async () => {
    mockGetLastState.mockReturnValue({ nextSnapshot: { storyId: STORY }, requestId: '' });

    const { answered, channel } = startTheRoad();
    // Nothing waits for an emit here - there is none to wait for. The channel is told the story
    // rendered exactly as Storybook itself would report it once its own boot-time selection lands.
    channel.emit('storyRendered', STORY);

    const answer = await answered;
    if (answer.kind !== 'captured') throw new Error(`the story was not captured: ${answer.kind}`);

    expect(channel.emitted('setCurrentStory')).toEqual([]);
    expect(answer.tree).toEqual(RECORDED_TREE);
  });

  it('still emits setCurrentStory when this boot handed over a different story', async () => {
    mockGetLastState.mockReturnValue({
      nextSnapshot: { storyId: 'components-splash--default' },
      requestId: '',
    });

    const answer = await walkOneStory();

    expect(answer.tree).toEqual(RECORDED_TREE);
  });

  it('still emits setCurrentStory when this boot handed over no story at all', async () => {
    mockGetLastState.mockReturnValue(undefined);

    const answer = await walkOneStory();

    expect(answer.tree).toEqual(RECORDED_TREE);
  });
});

describe('the classifier never quotes identical evidence and calls it changed', () => {
  it('reports "unchanged", not "changed", when the only difference between the two readings is an empty testID', async () => {
    // A view with no testID at all, and a view with the empty string, both exist on real screens -
    // and an empty string is not a name for anything. A reading that adds or drops one between the
    // start and the end of the wait must not read as "the reading changed": describeWhatWasHeld's
    // "before" and "after" quote the same real id here, and only the invisible empty entry used to
    // make the classifier reach for its other branch (see testIdsIn's own note on this).
    rememberAppMetadataCollector(() => ({
      viewProps: {
        ...METADATA_OF_A_DIFFERENT_SCREEN.viewProps,
        // No testID naming this story, but a view with the EMPTY STRING testID - the phantom entry
        // that used to make an unchanged reading look changed and leave a dangling separator.
        100: { className: 'RCTView', testID: '' },
      },
      texts: [],
    }));

    const answer = await answerOneStory();

    expect(answer.kind).toBe('crashed');
    const crashed = answer as Extract<CapturedAnswer, { kind: 'crashed' }>;
    // The one real id, quoted once, with no dangling ", " left by the empty id that used to be
    // concatenated in unconditionally - and "unchanged", because it never held anything else.
    expect(crashed.error?.message).toContain(
      'it held only components-splash--default the whole time it waited, unchanged'
    );
    expect(crashed.error?.message).not.toContain('it changed, but never to this story');
  }, 20000);
});

describe('a story that failed to render is recorded the way a run records it', () => {
  it('still clears the load-bearing gate, because a story that threw still gets its wrapper committed', async () => {
    // Storybook's StoryView wraps every story in its testID-carrying View OUTSIDE the error boundary,
    // so a story that threw before drawing anything else still commits that one wrapper - with NO
    // children under it yet, unlike a healthy story's. theStorysViewsAreInTheTree alone (a testID
    // node WITH children) would keep waiting for children that a broken story may never grow; the
    // gate must still pass here because the registry already calls this story broken.
    const THE_WRAPPER_WITH_NO_CHILDREN_YET = {
      viewHierarchy: node('ReactViewGroup', 1, [
        node('ReactViewGroup', 2, [node('ReactViewGroup', 3, [])]),
      ]),
      density: 3,
      fontScale: 1,
    };
    mockGetInspectorData.mockResolvedValue(THE_WRAPPER_WITH_NO_CHILDREN_YET);
    recordStoryError(STORY, {
      name: 'TypeError',
      message: 'nothing here is a function',
      stack: '',
      componentStack: '',
    });

    // walkOneStory itself throws if the gate did not clear (kind !== 'captured') - so a capture that
    // reaches this point at all is the proof the exception held.
    const answer = await walkOneStory();

    expect(answer.threw).toEqual({ name: 'TypeError', message: 'nothing here is a function' });
    expect(answer.root.reason).toEqual({ cause: 'story-broken', source: 'error-registry' });
  }, 10000);

  it('records the whole window when the boundary recorded that the story threw', async () => {
    recordStoryError(STORY, {
      name: 'TypeError',
      message: 'nothing here is a function',
      stack: '',
      componentStack: '',
    });

    const answer = await walkOneStory();

    // The run leaves its tree unprepared when a story contains an error, and a capture answers what a
    // run answers: re-rooting a thrown story would record a tree no run ever makes. The ending is
    // still the capture-and-threw one, so what threw is reported beside the tree.
    expect(answer.tree).toEqual(THE_WHOLE_WINDOW_NAMED_BY_THE_APP);
    expect(answer.threw).toEqual({ name: 'TypeError', message: 'nothing here is a function' });
    // The record names the registry as the reading that called it broken, not merely "broken".
    expect(answer.root).toEqual({
      at: 'window',
      nodeCount: expect.any(Number),
      reason: { cause: 'story-broken', source: 'error-registry' },
    });
  });

  it('records the whole window when the words of a failed render are on screen', async () => {
    rememberAppMetadataCollector(() => ({
      ...VIEW_METADATA,
      texts: ['Something went wrong rendering your story'],
    }));

    const answer = await walkOneStory();

    // A story can be broken without the registry knowing: Sherlo's boundary records the error and
    // then throws it on, so the boundary that ends up drawing the fallback can be the next one out.
    // The run reads the words off the screen as well as it reads the registry, so a capture does too -
    // reading only the registry would re-root a story a run leaves alone.
    expect(answer.tree).toEqual(THE_WHOLE_WINDOW_NAMED_BY_THE_APP);
    // This reading has no stale generation to tell apart from the live one - the one generation
    // it carries IS the live one (its testID tag, 3, is in the inspector's tree) - so the record
    // names it `live`, the same as any reading with only itself to read.
    expect(answer.root.reason).toEqual({
      cause: 'story-broken',
      source: 'fallback-text',
      generation: 'live',
    });
  });

  it("falls back to the merged reading when no generation's own tag is live in the inspector at all", async () => {
    // The app named the story - metadataOfTheApp resolves on any reading whose testID matches,
    // wherever the fiber that drew it happens to sit - but this reading's own tag (999) is not
    // among the tags INSPECTOR_DATA's tree carries, so `theStoryIsBroken` finds no live generation
    // to pick and reads the merged reading itself, fallback words and all.
    rememberAppMetadataCollector(() => ({
      viewProps: { 999: { className: 'RCTView', testID: STORY } },
      texts: [STORY_ERROR_FALLBACK_TEXT],
    }));

    const answer = await walkOneStory();

    expect(answer.root.reason).toEqual({
      cause: 'story-broken',
      source: 'fallback-text',
      generation: 'merged',
    });
  });

  it('does not measure a broken story, because a run does not measure one', async () => {
    recordStoryError(STORY, {
      name: 'TypeError',
      message: 'nothing here is a function',
      stack: '',
      componentStack: '',
    });
    // The story would be three screenfuls tall if the capture asked the native side for its size.
    mockIsScrollable.mockResolvedValue({ scrollable: true });
    mockScrollToCheckpoint.mockResolvedValue(THREE_SCREENFULS);

    const answer = await walkOneStory();

    // The run reads the story's error before it measures anything, so a broken story is one
    // screenful however tall the view on screen is. Measuring the error view instead would tell the
    // developer their story scrolls past the first screen when what scrolls is the fallback drawn in
    // its place - and measuring it would also put it back at its top before the tree is read.
    expect(mockIsScrollable).not.toHaveBeenCalled();
    expect(answer.parts).toBe(1);
  });

  it('reports no network image for a broken story, as a run reports none', async () => {
    recordStoryError(STORY, {
      name: 'TypeError',
      message: 'nothing here is a function',
      stack: '',
      componentStack: '',
    });

    const answer = await walkOneStory();

    // Whether an image is loaded over the network is read off the step that prepares the tree, and a
    // broken story skips that step, so the run has nothing to report and neither does a capture.
    expect(answer.hasNetworkImage).toBe(false);
  });
});

describe('a story that broke on an EARLIER screen does not make THIS one look broken', () => {
  // The app's published metadata (../appMetadata) is read from its own current fiber and that
  // fiber's `.alternate` (see MetadataProvider's collectMetadata) - so it can carry TWO fiber
  // generations at once: the one on screen now, and the one that was on screen a render ago. The
  // words a broken story leaves behind (STORY_ERROR_FALLBACK_TEXT) sit in whichever generation
  // rendered them, forever - even after the app has moved cleanly on to a different, working
  // story. A capture's FIRST story of a boot is exactly this: Storybook renders its own default
  // selection first, then this road moves it to the requested story over the channel (see the
  // file header) - so the default story's OWN fiber generation, error or not, is still sitting in
  // `.alternate` by the time this story's metadata is read. `metadata.generations` is what tells
  // the two apart: only the generation whose OWN testID-carrying view is still live in the
  // inspector's reading is read for the fallback words.
  const A_DIFFERENT_STORYS_OWN_NATIVE_TAG = 99;
  const THE_SCREEN_BEFORE_THIS_ONE_THREW = {
    viewProps: {
      [A_DIFFERENT_STORYS_OWN_NATIVE_TAG]: {
        className: 'RCTView',
        testID: 'components-splash--default',
      },
    },
    texts: [STORY_ERROR_FALLBACK_TEXT],
  };
  const THIS_STORYS_OWN_SCREEN = { viewProps: VIEW_METADATA.viewProps, texts: [] };

  beforeEach(() => {
    rememberAppMetadataCollector(() => ({
      // The merged reading a real collector hands back: every view from both generations (the
      // splash screen's own tag never collides with this story's, so nothing is overwritten), and
      // every word either one ever rendered - fallback text included, because it really was on
      // screen a moment ago. This is exactly what pollutes a check that does not know which
      // generation is which.
      viewProps: {
        ...THE_SCREEN_BEFORE_THIS_ONE_THREW.viewProps,
        ...THIS_STORYS_OWN_SCREEN.viewProps,
      },
      texts: [...THE_SCREEN_BEFORE_THIS_ONE_THREW.texts, ...THIS_STORYS_OWN_SCREEN.texts],
      generations: [THE_SCREEN_BEFORE_THIS_ONE_THREW, THIS_STORYS_OWN_SCREEN],
    }));
  });

  it("starts at the story's own root, not the window, even though a stale generation's fallback words are still in the merged reading", async () => {
    const answer = await walkOneStory();

    // A_DIFFERENT_STORYS_OWN_NATIVE_TAG (99) is not in INSPECTOR_DATA at all, so the generation
    // carrying the fallback words is not the live one - only THIS_STORYS_OWN_SCREEN's tag (3) is,
    // and it recorded no error. Recording the window here would be the exact bug this file exists
    // to close, one gate later than the one the rest of this suite already covers.
    expect(answer.tree).toEqual(RECORDED_TREE);
    expect(answer.threw).toBeUndefined();
    // The story was not broken at all, so there is nothing to say why the window was recorded -
    // it was not, this is the story's own root.
    expect(answer.root).toEqual({ at: 'story', nodeCount: 3 });
  });

  it('still records the whole window when the fallback words belong to the LIVE generation itself', async () => {
    // The genuine case: THIS story is the one that threw, not an earlier one. Swap which
    // generation carries the fallback words so it is the one whose tag IS live.
    rememberAppMetadataCollector(() => ({
      viewProps: { ...THE_SCREEN_BEFORE_THIS_ONE_THREW.viewProps, ...VIEW_METADATA.viewProps },
      texts: [STORY_ERROR_FALLBACK_TEXT],
      generations: [
        { viewProps: THE_SCREEN_BEFORE_THIS_ONE_THREW.viewProps, texts: [] },
        { viewProps: VIEW_METADATA.viewProps, texts: [STORY_ERROR_FALLBACK_TEXT] },
      ],
    }));

    const answer = await walkOneStory();

    expect(answer.tree).toEqual(THE_WHOLE_WINDOW_NAMED_BY_THE_APP);
    // This time the fallback words sit in the LIVE generation - the one whose own testID-carrying
    // view actually made it into the inspector's tree - so the record names it `live`, not `merged`.
    expect(answer.root.reason).toEqual({
      cause: 'story-broken',
      source: 'fallback-text',
      generation: 'live',
    });
  });
});

describe("the primitive is the fiber matched to the view, RCT-stripped, or the view's own class when none matched", () => {
  it("strips the platform's own RCT prefix off the fiber matched to the view - the same rule for whatever word follows it", async () => {
    rememberAppMetadataCollector(() => ({
      viewProps: {
        ...VIEW_METADATA.viewProps,
        // Every one of these has a fiber matched to it (a viewProps entry of its own), so every one
        // is read off that fiber's own React type - stripped by the ONE rule, `RCT` gone and
        // nothing else, not by a table of known words. `RCTImageView` becomes `ImageView`, not the
        // friendlier `Image` the old table used to pair it with, which is what proves this: a
        // class this app never heard of (`RCTSinglelineTextInputView`) strips exactly the same way.
        4: { className: 'RCTImageView' },
        5: { className: 'RCTSinglelineTextInputView' },
      },
      texts: [],
    }));

    const answer = await walkOneStory();

    // Node 3 (the re-rooted root) is RCTView; its children are nodes 4 and 5.
    expect(answer.tree.primitive).toBe('View');
    expect(answer.tree.children[0].primitive).toBe('ImageView');
    expect(answer.tree.children[0].children[0].primitive).toBe('SinglelineTextInputView');
  });

  it("keeps the view's own native class name, unstripped, when no fiber matched it", async () => {
    // A native-only view above the story never has a fiber of its own, so it is never enhanced -
    // exactly what the broken-story path exercises: theStorysOwnTree calls captureViewTree straight
    // on the raw inspector reading, matching what a run does for a story that contains an error
    // (see useTestStory.tsx: prepareInspectorData only runs when there is none).
    recordStoryError(STORY, {
      name: 'TypeError',
      message: 'nothing here is a function',
      stack: '',
      componentStack: '',
    });

    const answer = await walkOneStory();

    // The whole window, named by nobody: every primitive is the raw native class the inspector
    // reported it by - `ReactScrollView` is never printed as `ScrollView` here, because no React
    // type was ever matched to tell it apart from the platform's own name for it.
    expect(answer.tree).toEqual(THE_WHOLE_WINDOW_NAMED_BY_THE_APP);
  });

  it('prints no primitive at all when the view was named by something that is not a name', async () => {
    // A fiber that draws a view is named by a string; anything else - a component, a wrapper - must
    // not be printed as a primitive. The reading still has to name the story for the wait to accept
    // it at all (see "a capture waits for the reading that names its own story" above) -
    // VIEW_METADATA's own testID entry on node 3 does that; only node 4's className is malformed.
    rememberAppMetadataCollector(() => ({
      viewProps: {
        ...VIEW_METADATA.viewProps,
        4: { className: { name: 'FontScales' } as never },
      },
      texts: [],
    }));

    const answer = await walkOneStory();

    // Node 4 is the story's own ScrollView, re-rooted one level under the tree's own top.
    expect(answer.tree.children[0].primitive).toBe('');
  });
});

describe('the two facts beside the tree are read where a test run reads them', () => {
  it('counts the screenfuls the story is', async () => {
    mockIsScrollable.mockResolvedValue({ scrollable: true });
    mockScrollToCheckpoint.mockResolvedValue(THREE_SCREENFULS);

    const answer = await walkOneStory();

    expect(answer.parts).toBe(3);
  });

  it('asks how many screenfuls BEFORE it reads the tree, because measuring moves the story', async () => {
    mockIsScrollable.mockResolvedValue({ scrollable: true });
    mockScrollToCheckpoint.mockResolvedValue(THREE_SCREENFULS);

    await walkOneStory();

    // Asking for the story's size scrolls it to a checkpoint, so the read that builds the RECORDED
    // tree - the inspector's LAST call, once stabilizing and measuring are both done - has to come
    // after it, or the tree would be the story somewhere in the middle rather than as it renders from
    // the beginning. The load-bearing gate's own earlier read (before either of those) is not this -
    // it exists only to confirm the story is on screen at all, and holds no tree of its own.
    const inspectorCalls = mockGetInspectorData.mock.invocationCallOrder;
    expect(mockScrollToCheckpoint.mock.invocationCallOrder[0]).toBeLessThan(
      inspectorCalls[inspectorCalls.length - 1]
    );
  });

  it('never asks the native side to scroll a story that fits the screen', async () => {
    const answer = await walkOneStory();

    expect(answer.parts).toBe(1);
    expect(mockScrollToCheckpoint).not.toHaveBeenCalled();
  });

  it('says one screenful when the native side could not measure the story', async () => {
    mockIsScrollable.mockResolvedValue({ scrollable: true });
    mockScrollToCheckpoint.mockRejectedValue(new Error('no scroll view'));

    const answer = await walkOneStory();

    // A story that cannot be measured is reported as the one screenful the developer can see.
    expect(answer.parts).toBe(1);
  });

  it('reports an image loaded over the network, as the run reports it', async () => {
    rememberAppMetadataCollector(() => ({
      viewProps: {
        ...VIEW_METADATA.viewProps,
        4: { className: 'RCTScrollView', hasNetworkImage: true },
      },
      texts: [],
    }));

    const answer = await walkOneStory();

    // The run reads this off the same step it prepares its tree with, and so does the capture - one
    // reading of the story, not two that can disagree.
    expect(answer.hasNetworkImage).toBe(true);
  });

  it('reports no network image for a story that carries none', async () => {
    const answer = await walkOneStory();

    expect(answer.hasNetworkImage).toBe(false);
  });
});

describe('a capture restarts the app into testing mode, so isRunningVisualTests is true for the story it records', () => {
  it('restarts the app rather than walk a story out of a session that is not a test run', async () => {
    mockGetMode.mockReturnValue('default');

    const asked: Saying[] = [];
    const capture: CaptureTransport = {
      waitForACapture: async (saying) => {
        asked.push(saying);
        return { restartIntoTesting: true };
      },
    };
    startCaptureTransport({ view: makeView(), channel: makeChannel(), capture });

    // openTesting is the restart: the app that comes back reports `testing`, which is what makes
    // isRunningVisualTests true for it. The story is recorded by that app, not by this one, so
    // nothing is walked or read on the way out.
    await vi.waitFor(() => expect(mockOpenTesting).toHaveBeenCalledTimes(1));

    expect(asked).toEqual([{ mode: 'default', stories: [STORY], answer: null }]);
    // The relay sent no story alongside this restart, and none is invented on the way out. The
    // app's own config rides along regardless - getConfigOrDefault()'s answer, since a capture has
    // no config.sherlo of its own to send (see the file header).
    expect(mockOpenTesting).toHaveBeenCalledWith(undefined, CONFIG);
    expect(mockStabilize).not.toHaveBeenCalled();
    expect(mockGetInspectorData).not.toHaveBeenCalled();
    expect(mockAwaitFrameCommit).not.toHaveBeenCalled();
  });

  it('hands the restart the story the relay asked for, so the app that comes back can land on it directly', async () => {
    // The relay already knows which story the tool is waiting for at the exact moment it tells the
    // app to restart into testing mode (see metro/captureSocket.js), so it sends the story id
    // alongside the restart instruction rather than making the app ask a second time.
    mockGetMode.mockReturnValue('default');

    const capture: CaptureTransport = {
      waitForACapture: async () => ({ restartIntoTesting: true, storyId: STORY }),
    };
    startCaptureTransport({ view: makeView(), channel: makeChannel(), capture });

    // The story rides straight through to the native side - the same hand-over a run's own restart
    // already gets, now given to a capture's first story too (see the file header).
    await vi.waitFor(() => expect(mockOpenTesting).toHaveBeenCalledWith(STORY, CONFIG));
  });
});

describe('a capture never writes a test-run artifact', () => {
  it('reads and writes nothing in storage', async () => {
    await walkOneStory();

    // A test run saves screenshots and writes the protocol file; a capture does neither. The story is
    // read in memory, straight from the inspector, and saveScreenshots is off. (The restart-into-
    // testing hand-over is a different, narrower write - see the file header - and this file has
    // nothing to do with it: this road never calls appendFile/readFile at all, restart or not.)
    expect(mockAppendFile).not.toHaveBeenCalled();
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});

describe('a walk that throws is the crash ending', () => {
  it('answers with the crash, and the words of what threw', async () => {
    // getConfigOrDefault never throws (see the describe below) - what still can is the walk
    // itself, mid-story, the way stabilizing genuinely can fail on a real device.
    mockStabilize.mockRejectedValue(new TypeError('the app stopped answering'));

    const answer = await answerOneStory();

    // The app stopped answering mid-walk: the tool is told so rather than left waiting, and it is
    // told what threw, so a developer reads the reason instead of an empty screen.
    expect(answer).toEqual({
      kind: 'crashed',
      storyId: STORY,
      error: { name: 'TypeError', message: 'the app stopped answering' },
    });
  });

  it('answers with the crash alone when what threw said nothing readable', async () => {
    // The story reaches the screen and the app dies while steadying it - so the walk gets that far,
    // and what throws is what the tool is told about. It threw something that is not an error and
    // says nothing: no name, no message. The tool still learns the app stopped answering - it just
    // has no words to pass on.
    mockStabilize.mockRejectedValue('the app stopped answering');

    const answer = await answerOneStory();

    expect(answer).toEqual({ kind: 'crashed', storyId: STORY });
  });
});

/* ========================================================================== */

/** Start the road for one story, with the bundler stood up as a socket handing that story over. */
function startTheRoad(
  settings: Partial<typeof STABILIZATION_SETTINGS> | undefined = STABILIZATION_SETTINGS,
  view: ReturnType<typeof makeView> = makeView()
): {
  answered: Promise<CapturedAnswer>;
  channel: ReturnType<typeof makeChannel>;
  asked: Saying[]; // what the app said each time it asked the bundler
} {
  const channel = makeChannel();
  const asked: Saying[] = [];
  const answered = new Promise<CapturedAnswer>((resolve) => {
    const capture: CaptureTransport = {
      waitForACapture: async (saying) => {
        asked.push(saying);

        // The second ask is the one carrying what was recorded - that asking IS the answer to the
        // tool. Nothing more is posted, so the app parks here and the test ends after one clean walk.
        if (saying.answer) {
          resolve(saying.answer);
          return new Promise<never>(() => {});
        }
        return { storyId: STORY, settings };
      },
    };
    startCaptureTransport({ view, channel, capture });
  });

  return { answered, channel, asked };
}

/**
 * Put one story on screen through the real road, then hand back whatever the app answered.
 *
 * A walk that throws before it reaches the screen never gets here: the app asks Storybook to show the
 * story and waits for Storybook to say it did, so a test that crashes earlier drives the road itself
 * through `startTheRoad().answered` rather than waiting on a screen that is never coming.
 */
async function answerOneStory(
  settings?: Partial<typeof STABILIZATION_SETTINGS>,
  view?: ReturnType<typeof makeView>
): Promise<CapturedAnswer> {
  const { answered, channel } = startTheRoad(settings, view);

  await vi.waitFor(() => expect(channel.emitted('setCurrentStory')).toEqual([{ storyId: STORY }]));
  channel.emit('storyRendered', STORY);

  return answered;
}

/** Walk one story through the real road and hand back what the app recorded. */
async function walkOneStory(
  settings?: Partial<typeof STABILIZATION_SETTINGS>
): Promise<CapturedStory> {
  const answer = await answerOneStory(settings);
  if (answer.kind !== 'captured') throw new Error(`the story was not captured: ${answer.kind}`);
  return answer;
}

/**
 * The app's Storybook view, as much of it as this road reads - `_storyIndex` for the stories a
 * capture reports to the bundler, and, for a crash's own diagnostics, whatever `_ready` and
 * `_preview.currentSelection` a test wants Storybook to be reporting of itself at the moment the
 * gate gives up. Left at their real-code defaults (not ready, no selection) unless a test overrides
 * them.
 */
function makeView(
  overrides: { ready?: boolean; storyIds?: string[]; selectedStoryId?: string } = {}
) {
  const { ready = false, storyIds = [STORY], selectedStoryId } = overrides;
  return {
    _ready: ready,
    _storyIndex: { entries: Object.fromEntries(storyIds.map((id) => [id, {}])) },
    _preview: { currentSelection: selectedStoryId ? { storyId: selectedStoryId } : null },
  } as never;
}

/** Storybook's channel, as much of it as this road uses. */
function makeChannel() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const emitted: Array<[string, unknown]> = [];

  return {
    on: (event: string, listener: (...args: unknown[]) => void) => {
      (listeners[event] ||= []).push(listener);
    },
    off: (event: string, listener: (...args: unknown[]) => void) => {
      listeners[event] = (listeners[event] || []).filter((other) => other !== listener);
    },
    emit: (event: string, ...args: unknown[]) => {
      emitted.push([event, args[0]]);
      (listeners[event] || []).slice().forEach((listener) => listener(...args));
    },
    emitted: (event: string) =>
      emitted.filter(([name]) => name === event).map(([, payload]) => payload),
  };
}

/** One view the inspector reports, with everything this road reads filled in. */
function node(className: string, id: number, children: unknown[]) {
  return { id, className, isVisible: true, x: 0, y: 0, width: 390, height: 844, children };
}

/* ========================================================================== */
/*
 * THE RECORD IS THE INSPECTOR'S (sherlo book, What a capture records). The shells below are the
 * rules that page marks; the task that makes them true fills them in and never renames one.
 */

describe('a capture carries every field the inspector recorded for a view', () => {
  it('carries the tag the inspector names the view by, whether it is visible, its box in pixels and in points, its style, its testID and its children', async () => {
    rememberAppMetadataCollector(() => ({
      viewProps: {
        ...VIEW_METADATA.viewProps,
        4: { className: 'RCTScrollView', style: { backgroundColor: 'red' } },
      },
      texts: [],
    }));

    const answer = await walkOneStory();

    // The story's own root - the view Storybook wraps it in - carries the testID matched to it,
    // its box in both units, and its own visibility, the same as every node this fixture reports.
    expect(answer.tree).toEqual({
      primitive: 'View',
      components: [],
      visible: true,
      ...BOX_IN_PIXELS,
      size: BOX_IN_POINTS,
      testID: STORY,
      children: [
        {
          primitive: 'ScrollView',
          components: ['TypographyScales'],
          visible: true,
          ...BOX_IN_PIXELS,
          size: BOX_IN_POINTS,
          style: { backgroundColor: 'red' },
          children: [
            {
              primitive: 'Text',
              components: ['SectionTitle'],
              visible: true,
              ...BOX_IN_PIXELS,
              size: BOX_IN_POINTS,
              children: [],
            },
          ],
        },
      ],
    });
  });

  it('names the tag the way the inspector does: the React type with its RCT prefix removed, and the native class when no React type matches', async () => {
    mockGetInspectorData.mockResolvedValue({
      viewHierarchy: node('RCTView', 1, [node('RCTSherloOverlayHostView', 2, [])]),
      density: 3,
      fontScale: 1,
    });
    rememberAppMetadataCollector(() => ({
      viewProps: { 1: { className: 'RCTView', testID: STORY } },
      texts: [],
    }));

    const answer = await walkOneStory();

    // Node 1 has a fiber matched to it, so its React type - RCT-stripped - names it.
    expect(answer.tree.primitive).toBe('View');
    // Node 2 has none: nothing of the app ever rendered it, so it keeps its own native class,
    // unstripped - it was never a React type to begin with.
    expect(answer.tree.children[0].primitive).toBe('RCTSherloOverlayHostView');
  });

  it('carries a placeholder and numberOfLines as the props they are, and nothing else a fiber holds', async () => {
    rememberAppMetadataCollector(() => ({
      viewProps: {
        ...VIEW_METADATA.viewProps,
        // An extra key a fiber's props might carry (a handler, here) proves the record keeps
        // none of these once they cross into `props` - only a placeholder, numberOfLines and
        // accessibilityLabel do.
        4: {
          className: 'RCTScrollView',
          numberOfLines: 2,
          accessibilityLabel: 'Font sizes list',
          onPress: () => {},
        } as never,
        5: { className: 'RCTText', placeholder: 'Type here' } as never,
      },
      texts: [],
    }));

    const answer = await walkOneStory();

    // accessibilityLabel rides beside testID, placeholder and numberOfLines - it is what a mocked
    // value often lands on, an icon or image with no Text, where it is the only words the view has.
    expect(answer.tree.children[0].props).toEqual({
      numberOfLines: 2,
      accessibilityLabel: 'Font sizes list',
    });
    expect(answer.tree.children[0].children[0].props).toEqual({ placeholder: 'Type here' });
  });
});

describe('a capture carries the density and font scale beside the tree', () => {
  it('reads both off the inspector and answers with them beside the tree', async () => {
    mockGetInspectorData.mockResolvedValue({ ...INSPECTOR_DATA, density: 2, fontScale: 1.3 });

    const answer = await walkOneStory();

    expect(answer.density).toBe(2);
    expect(answer.fontScale).toBe(1.3);
  });
});

describe('a text view carries the words it draws', () => {
  it('reads the words off the props of the component that drew the text', async () => {
    rememberAppMetadataCollector(() => ({
      viewProps: { ...VIEW_METADATA.viewProps, 5: { className: 'RCTText', text: 'Font sizes' } },
      texts: [],
    }));

    const answer = await walkOneStory();

    expect(answer.tree.children[0].children[0].text).toBe('Font sizes');
  });

  it('joins the strings of a text made of several', async () => {
    // A text made of a plain string and a nested span: `<Text>Hello <Text>World</Text></Text>`,
    // where the span is a Text of its own, one level down in the same tree the inspector reports.
    mockGetInspectorData.mockResolvedValue({
      viewHierarchy: node('RCTView', 1, [node('RCTText', 2, [node('RCTVirtualText', 3, [])])]),
      density: 3,
      fontScale: 1,
    });
    rememberAppMetadataCollector(() => ({
      viewProps: {
        1: { className: 'RCTView', testID: STORY },
        2: { className: 'RCTText', text: 'Hello ' },
        3: { className: 'RCTVirtualText', text: 'World' },
      },
      texts: [],
    }));

    const answer = await walkOneStory();

    // The span's own words join the words of the text that holds it, in order.
    expect(answer.tree.children[0].text).toBe('Hello World');
  });

  it('carries no words for a view that draws none', async () => {
    const answer = await walkOneStory();

    // VIEW_METADATA's Text (node 5) says nothing - the same absence a view that is not even a
    // Text primitive already carries, which its ScrollView parent proves alongside it.
    expect(answer.tree.children[0].children[0].text).toBeUndefined();
    expect(answer.tree.children[0].text).toBeUndefined();
  });
});

describe('the record nests a view under the view the platform placed it in', () => {
  it("a view's children are the views the inspector reported inside it, and no view moves beside its container", async () => {
    // A container (node 4) holding two rows (nodes 5 and 6), the shape a device once flattened -
    // recording the rows as siblings of the View that holds them instead of nested under it.
    mockGetInspectorData.mockResolvedValue({
      viewHierarchy: node('RCTView', 1, [
        node('RCTView', 2, [
          node('RCTScrollView', 3, [
            node('RCTView', 4, [node('RCTView', 5, []), node('RCTView', 6, [])]),
          ]),
        ]),
      ]),
      density: 3,
      fontScale: 1,
    });
    rememberAppMetadataCollector(() => ({
      viewProps: {
        2: { className: 'RCTView', testID: STORY },
        3: { className: 'RCTScrollView' },
        4: { className: 'RCTView' },
        5: { className: 'RCTView' },
        6: { className: 'RCTView' },
      },
      texts: [],
    }));

    const answer = await walkOneStory();

    const scrollView = answer.tree.children[0];
    const container = scrollView.children[0];
    // The ScrollView holds only its own content container - never the rows themselves, moved up a
    // level to sit beside it.
    expect(scrollView.children).toHaveLength(1);
    // The rows stay nested under the container the platform placed them in.
    expect(container.children).toHaveLength(2);
  });
});
