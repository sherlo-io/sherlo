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
 *     for the story it records.
 *   - nothing touches the device's storage.
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
  },
}));

import {
  startCaptureTransport,
  stopCaptureTransport,
  type CaptureTransport,
  type CapturedAnswer,
} from '../captureTransport';
import { __resetStoryRenderedTrackingForTests } from '../getStorybook/components/TestingMode/useTestAllStories/storyRenderedReadiness';
import { rememberAppMetadataCollector } from '../appMetadata';
import { rememberStoryOfTheApp } from '../componentNames';
import { clearStoryError, recordStoryError } from '../getStorybook/storyErrorRegistry';

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

/**
 * What the app records of this story: the view Storybook wraps the story in comes first, then the
 * story as the app renders it. The two views above Storybook's are gone, and the story's own root is
 * one line in.
 */
const RECORDED_TREE = {
  primitive: 'View',
  components: [],
  children: [
    {
      primitive: 'ScrollView',
      components: ['TypographyScales'],
      children: [{ primitive: 'Text', components: ['SectionTitle'], children: [] }],
    },
  ],
};

/**
 * The app's whole window as the inspector answered it: Sherlo's frame, Storybook's, the view
 * Storybook wraps a story in, and the story under it. No view is re-rooted and none is named.
 *
 * This is what a capture records when nothing rendered this app the way a run renders it: there is
 * no view carrying a story id to start at, and no published name to print beside a view.
 */
const THE_WHOLE_WINDOW = {
  primitive: 'View',
  components: [],
  children: [
    {
      primitive: 'View',
      components: [],
      children: [
        {
          primitive: 'View',
          components: [],
          children: [
            {
              primitive: 'ScrollView',
              components: [],
              children: [{ primitive: 'Text', components: [], children: [] }],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * The same window, with the names the app published for its views - what a capture records when the
 * story on screen is broken.
 *
 * A broken story is re-rooted by nobody, but it is still named where the app named it: the names come
 * from the capture's own reading of the fibers, which is not the step a run skips.
 */
const THE_WHOLE_WINDOW_NAMED_BY_THE_APP = {
  primitive: 'View',
  components: [],
  children: [
    {
      primitive: 'View',
      components: [],
      children: [
        {
          primitive: 'View',
          components: [],
          children: [
            {
              primitive: 'ScrollView',
              components: ['TypographyScales'],
              children: [{ primitive: 'Text', components: ['SectionTitle'], children: [] }],
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

describe('the app that comes back from the restart is told which story to show', () => {
  it('re-tells the app once its own default selection has overwritten the first telling, and does not stop until the story it asked for is the one that actually rendered', async () => {
    // A capture's restarted app has no `initialSelection` to land on (see the file header): it boots
    // onto a placeholder and runs its OWN default selection to get somewhere. The first
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

    // The capture recorded the story it asked for - not the app's own placeholder, and not a crash
    // for a story that eventually did render, just not on the first asking.
    expect(answer.tree).toEqual(RECORDED_TREE);
  });
});

describe("a capture's first story appears even though the app booted onto the placeholder", () => {
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

  it('records the whole window when nothing rendered this app the way a run renders it', async () => {
    rememberAppMetadataCollector(undefined);
    rememberStoryOfTheApp(undefined);

    const answer = await walkOneStory();

    // No view carries a story id, so there is no story to start at and nothing to name the app's
    // components by. The window is recorded as the inspector answered it - and every class is still
    // read through the table, so the screen still prints words the developer knows.
    expect(answer.tree).toEqual(THE_WHOLE_WINDOW);
  });

  it("the first capture after the restart starts at the story's own root, not at the app window", async () => {
    // The app publishes its view metadata (../appMetadata) from an effect that runs once the app
    // has rendered. On a real device, the FIRST capture after a restart can reach the inspector
    // before that effect has had its turn - the seam is still unpublished the instant Storybook
    // reports the story rendered, and arrives a beat later, the way a pending effect does.
    rememberAppMetadataCollector(undefined);

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

  it('reports a timed-out metadata wait, and a tree rooted at the window, when no reading ever names the story', async () => {
    // Nothing ever publishes a reading that names STORY, so the metadata wait runs out its whole
    // ceiling - the same state "records the whole window when nothing rendered this app" walks.
    rememberAppMetadataCollector(undefined);
    rememberStoryOfTheApp(undefined);

    const answer = await walkOneStory();

    expect(answer.waited.metadata.outcome).toBe('timed-out');
    // No metadata means theStorysOwnTree never re-roots (see there), so the story-views wait has
    // nothing to poll for either - it is the same one-read shape a first-check is.
    expect(answer.waited.storyViews).toEqual({
      outcome: 'first-check',
      ms: expect.any(Number),
      rereads: 0,
    });
    expect(answer.root.at).toBe('window');
  }, 10000);

  it('reports a timed-out story-views wait, and a tree rooted at the window, when the inspector never catches up', async () => {
    // The metadata already names STORY, but the inspector's own tree never grows the story's views -
    // the wait that watches for that runs out its whole ceiling instead of polling forever.
    const THE_APPS_SHELL = {
      viewHierarchy: node('ReactViewGroup', 1, [node('ReactViewGroup', 2, [])]),
      density: 3,
      fontScale: 1,
    };
    mockGetInspectorData.mockResolvedValue(THE_APPS_SHELL);

    const answer = await walkOneStory();

    expect(answer.waited.metadata.outcome).toBe('first-check');
    expect(answer.waited.storyViews.outcome).toBe('timed-out');
    expect(answer.waited.storyViews.rereads).toBeGreaterThan(0);
    // prepareInspectorData found no node to re-root at, so the tree recorded is the app's shell.
    expect(answer.root.at).toBe('window');
  }, 10000);
});

describe('a story that failed to render is recorded the way a run records it', () => {
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

describe('the primitive is one of the words the screen prints, whatever class the view was drawn by', () => {
  it('pairs both platforms, and keeps the name of a class the table does not pair', async () => {
    mockGetInspectorData.mockResolvedValue({
      viewHierarchy: node('ReactViewGroup', 1, [
        node('ReactTextView', 2, []),
        node('RCTView', 3, []),
        node('RCTText', 4, []),
        node('RCTVirtualText', 5, []),
        node('ReactImageView', 6, []),
        node('RCTScrollView', 7, []),
        node('RCTModalHostView', 8, []),
      ]),
      density: 3,
      fontScale: 1,
    });
    // Nothing published a reading of this app, so no view is renamed by a fiber and the table is all
    // that names these - which is what makes this case read as the table itself.
    rememberAppMetadataCollector(undefined);
    rememberStoryOfTheApp(undefined);

    const answer = await walkOneStory();

    // The window's own root is a View; these are what it holds.
    expect(answer.tree.children.map((child) => child.primitive)).toEqual([
      'Text',
      'View',
      'Text',
      'Text',
      'Image',
      'ScrollView',
      // A class the table does not pair keeps its own name: a word this file guessed for it would be
      // worse than one a developer can look up.
      'RCTModalHostView',
    ]);
  });

  it('prints no primitive at all when the view was named by something that is not a name', async () => {
    // A fiber that draws a view is named by a string; anything else - a component, a wrapper - is not
    // a class the table can pair, and must not be printed as one. The reading still has to name the
    // story for the wait to accept it at all (see "a capture waits for the reading that names its own
    // story" above) - VIEW_METADATA's own testID entry on node 3 does that; only node 4's className
    // is made malformed here.
    rememberAppMetadataCollector(() => ({
      viewProps: {
        ...VIEW_METADATA.viewProps,
        4: { className: { name: 'FontScales' } as never },
      },
      texts: [],
    }));
    rememberStoryOfTheApp(undefined);

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

    // Asking for the story's size scrolls it to a checkpoint, so a tree read first would be the
    // story somewhere in the middle rather than the story as it renders from the beginning.
    expect(mockScrollToCheckpoint.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetInspectorData.mock.invocationCallOrder[0]
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
    expect(mockStabilize).not.toHaveBeenCalled();
    expect(mockGetInspectorData).not.toHaveBeenCalled();
    expect(mockAwaitFrameCommit).not.toHaveBeenCalled();
  });
});

describe("a capture reads and writes nothing in the device's storage", () => {
  it('reads and writes nothing in storage', async () => {
    await walkOneStory();

    // A test run saves screenshots and writes the protocol file; a capture does neither. The story is
    // read in memory, straight from the inspector, and saveScreenshots is off.
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
  settings: Partial<typeof STABILIZATION_SETTINGS> | undefined = STABILIZATION_SETTINGS
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
    startCaptureTransport({ view: makeView(), channel, capture });
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
  settings?: Partial<typeof STABILIZATION_SETTINGS>
): Promise<CapturedAnswer> {
  const { answered, channel } = startTheRoad(settings);

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

/** The app's Storybook view, as much of it as this road reads. */
function makeView() {
  return { _storyIndex: { entries: { [STORY]: {} } } } as never;
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
