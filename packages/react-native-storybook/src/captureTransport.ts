/**
 * THE APP'S HALF OF THE CAPTURE SOCKET - the JavaScript that walks one story for `sherlo capture`
 * and answers over the bundler's address.
 *
 * It holds one request open against the address the bundler serves (metro/captureSocket.js), saying
 * which mode it is in, what stories it has, and the answer to the capture it was last handed. The
 * answer is either a restart into testing mode - because a capture has to count as a test run - or
 * the story to capture with the stabilization settings to use. It walks that story, then asks again,
 * and that next asking - carrying what it just recorded - is its answer to the tool.
 *
 * THE SAME STORY PATH A TEST RUN WALKS, READ AGAIN - WITH ONE STEP A RUN NEVER TAKES. A run restarts
 * once per story, so it never has to move Storybook off a story already on screen: the native side
 * hands the story it wants as `initialSelection`, and Storybook lands on it the moment it boots. A
 * capture restarts once and then walks MANY stories in the SAME boot, so after the first it has no
 * restart left to spend - moving to the next story has to happen through Storybook's own channel, the
 * same way `sherlo open` moves a story that is already showing. Wait for it to render, close the
 * last-frame gap, stabilize, and read the view tree - THAT part is the run's own steps, told over a
 * socket rather than the runner's file and answered over the same socket rather than the runner's file.
 *
 * THE FIRST STORY OF A SESSION HAS NO INITIAL SELECTION TO LAND ON. A capture writes nothing to disk
 * before it restarts (see below), so the native side has no story to hand over as `initialSelection` -
 * Storybook boots onto its own placeholder, which names no real story, and runs its own default
 * selection to get there. That default selection is what a capture has to move Storybook OFF of for
 * story number one too, over the exact same channel it uses for every story after - not a special
 * case, just the first race this file's retry already has to win (see waitForTheStoryOnScreen).
 *
 * THE TREE STARTS WHERE THE RUN'S TREE STARTS. The app's window holds more than the story: Sherlo's
 * own frame, Storybook's, the story view Storybook wraps a story in. A test run collapses all of it
 * by handing the inspector's tree to the one step that knows where a story begins
 * (./getStorybook/components/TestingMode/useTestAllStories/prepareInspectorData), and a capture
 * records the same tree, so it goes through that same step rather than a second reading of its own.
 * That step needs the app's view metadata, which the run holds as a React ref and a capture, having
 * no renderer, reads from the seam the renderer publishes it on (./appMetadata).
 *
 * NOTHING IS READ OR WRITTEN IN STORAGE. A test run saves screenshots and writes the protocol file;
 * a capture needs neither, so it stabilizes with saveScreenshots off and never touches a file. The
 * view tree comes straight from the native inspector, over the socket, in memory the whole way.
 *
 * THE TREE NAMES THE APP'S COMPONENTS. Every node reports the primitive it is drawn by, and beside
 * it the names of the app's components that render that view, outermost first - so the command
 * prints `SampleLine › Text` where a bare `Text` would leave a developer guessing (./componentNames).
 * The names come from the app's own functions, so a view the app did not write is nameless, and a
 * bundle that dropped the names leaves them absent rather than invented.
 *
 * THE PRIMITIVE IS ONE OF THREE WORDS. A view is drawn by a native class, and the class is named
 * for the platform rather than for the developer who reads the tree: `ReactTextView` on Android,
 * `RCTText` on both. What the command prints is `View`, `Text`, `Image` - the words the tool's own
 * screen documents - so every class is read through one table, below.
 *
 * TWO FACTS BESIDE THE TREE, because a developer cannot see either from where they are sitting: how
 * many screenfuls the story is, so a story that scrolls past the first screen is not mistaken for
 * one that fits, and whether it is loaded over the network - which a cloud capture depends on, and
 * which a developer cannot do anything about from where they are. Both are read the way the test
 * run reads them and from the same places: the native side is asked to measure the story, and the
 * network image is the second answer the run's own tree preparation gives beside the tree it
 * prepares.
 *
 * A CAPTURE REPORTS HOW IT WAITED, NOT ONLY WHAT IT RECORDED. A capture that waited its whole
 * ceiling and gave up answers with the same shape as one that found everything on the first check -
 * both report `kind: 'captured'`, both carry a tree. The answer also carries how the two waits this
 * file runs (for a published reading that names the story, and for that story's own views to be in
 * the inspector's tree) each ended - on the first check, after polling, or by running out - and what
 * the tree that was finally recorded is rooted at (see WaitOutcome). Carried in the answer, never
 * inferred on the other end of the socket from what it received.
 */
import { NativeModules } from 'react-native';
import SherloModule from './SherloModule';
import { InspectorData, InspectorDataNode, StorybookView } from './types';
import { componentNamesByNativeTag, type ComponentNamesByNativeTag } from './componentNames';
import { collectAppMetadata } from './appMetadata';
import { STORY_ERROR_FALLBACK_TEXT } from './constants';
import { prepareInspectorData } from './getStorybook/components/TestingMode/useTestAllStories/prepareInspectorData';
import { readStoryError } from './getStorybook/storyErrorRegistry';
import {
  startStoryRenderedTracking,
  waitForStoryRendered,
  type StorybookChannel,
} from './getStorybook/components/TestingMode/useTestAllStories/storyRenderedReadiness';

const SET_CURRENT_STORY = 'setCurrentStory';

/** The one address Sherlo adds to the bundler; the other half of it is metro/captureSocket.js. */
const CAPTURE_PATH = '/sherlo/capture';

/**
 * How long the app leaves a request hanging before it gives up on it. Longer than the bundler's own
 * hold, so an unanswered request means the road itself is gone rather than that there was simply no
 * capture to hand over.
 */
const HOLD_TIMEOUT_MS = 25000;

/** How long to leave the address alone after it failed to answer, rather than spin on a closed door. */
const RETRY_AFTER_SILENCE_MS = 2000;

/** How long a test run waits for STORY_RENDERED before the scrollable fallback. A capture has no fallback. */
const STORY_RENDERED_TIMEOUT_MS = 5000;

/**
 * How often a capture repeats "show this story" over the channel while it has not yet been told the
 * story rendered - not a poll for a reading that already exists somewhere, but a retry of an act that
 * can lose a one-time race against the restarted app's own default selection (see the file header).
 * Short relative to STORY_RENDERED_TIMEOUT_MS, so a race lost once still leaves room to be told again
 * and win the next one well inside the same ceiling a single telling already had.
 */
const SELECT_STORY_RETRY_INTERVAL_MS = 250;

/** How long a test run lets the paint barrier run before the stability loop proceeds. */
const PAINT_BARRIER_TIMEOUT_MS = 1000;

/** How long a test run keeps asking the inspector for the view tree before it gives up. */
const INSPECTOR_TIMEOUT_MS = 10000;

/**
 * How long a capture waits for the app to publish a reading of ITS OWN STORY (./appMetadata) before
 * it gives up and records the window. The wait exists to survive one pending passive effect on the
 * FIRST capture after a restart (see metadataOfTheApp below) - on every ordinary check the published
 * reading already names the story on the first poll, so this ceiling costs nothing in the paths that
 * are not racing anything.
 *
 * THIS BOUNDS A READING THAT NEVER NAMES THE STORY, NOT THE RACE. The race itself is normally over
 * within a frame or two; what this number has to survive is a passive effect queued behind other
 * work on a loaded device - the exact condition a CI emulator produces - so it is sized like the
 * command's other genuine give-ups (INSPECTOR_TIMEOUT_MS at 10s), not like a fast-path poll.
 */
const METADATA_TIMEOUT_MS = 2000;

/** How often the wait above re-checks, between one short wait and the next. */
const METADATA_POLL_INTERVAL_MS = 10;

/**
 * How long a capture keeps re-reading the inspector, once the app's own reading already names the
 * story, for the STORY'S OWN VIEWS to actually be in the tree the inspector answers with - not
 * merely for the app to have reported the story rendered.
 *
 * TWO DIFFERENT CLOCKS, NOT ONE. METADATA_TIMEOUT_MS above survives a reading that has not yet
 * caught up to this story; this ceiling survives a DIFFERENT gap one clock later. The app's
 * published reading is built from the fiber tree, where the story exists as soon as JavaScript has
 * rendered it. The inspector answers with the NATIVE view hierarchy, where the story's views do not
 * exist until the host views are mounted. A reading can already name the story while the inspector
 * still answers with nothing past the app's shell - most of all on the first capture after a
 * restart, the exact condition METADATA_TIMEOUT_MS exists for one clock earlier.
 *
 * Sized the same way: what this has to survive is native mounting work queued behind other work on
 * a loaded device, not the race itself, which is normally over within a frame or two.
 */
const STORY_VIEWS_TIMEOUT_MS = 2000;

/** How often the wait above re-reads the inspector, between one poll and the next. */
const STORY_VIEWS_POLL_INTERVAL_MS = 10;

/** What a story threw while rendering, as the app reports it to the bundler. */
export type StoryThrew = { name: string; message: string };

/**
 * How one of the two waits below ended: on the very first check, after re-checking one or more
 * times, or by running out its ceiling without ever seeing what it was waiting for.
 *
 * THIS EXISTS BECAUSE FOUR ROUNDS OF FIXING THE WRONG WAIT COULD NOT TELL THEMSELVES APART (see the
 * file header). A capture that waited its whole ceiling and gave up recorded the same shape as one
 * that found everything on the first check - `outcome` and `ms` are the difference reaching the
 * terminal, at last, instead of only a tree that happens to be wrong.
 */
export type WaitOutcome = {
  outcome: 'first-check' | 'polled' | 'timed-out';
  /** How long the wait took, start to finish, in ms. */
  ms: number;
};

/**
 * One view in the tree a capture records - the native class of the node, and the names of the
 * app's components that render it, outermost first. No names means the app did not write this
 * view, or its bundle did not keep the names.
 */
export type CapturedViewTree = {
  primitive: string;
  components: string[];
  children: CapturedViewTree[];
};

/** What the app answers about the story it was handed. */
export type CapturedAnswer =
  | {
      kind: 'captured';
      storyId: string;
      /** How the stabilization ended: settled after so long over so many frames, or gave up. */
      settled: { ms: number; frames: number } | 'timed-out';
      threw?: StoryThrew;
      /** How many screenfuls the story was captured in - 1 is a story that fits the screen. */
      parts: number;
      /** Whether any view in the story loads an image over the network. */
      hasNetworkImage: boolean;
      tree: CapturedViewTree;
      /**
       * How the two waits a capture cannot see through the drawn screen went: the wait for the
       * app's own reading of its views to name this story (./appMetadata), and the wait for the
       * story's own views to actually be in the inspector's tree once that reading did.
       */
      waited: {
        metadata: WaitOutcome;
        /** The same three answers, plus how many times the inspector was re-read. */
        storyViews: WaitOutcome & { rereads: number };
      };
      /** What the recorded tree is rooted at - the story's own root, or the app's whole window - and how many nodes it holds. */
      root: { at: 'story' | 'window'; nodeCount: number };
    }
  | {
      kind: 'crashed';
      storyId: string;
      error?: StoryThrew;
    };

/**
 * The stabilization numbers a capture is handed, as the runner writes them today. Every one is
 * optional here because the app falls back to its own config when a value is missing.
 *
 * threshold AND includeAA ARE HERE FOR THE SAME REASON AS THE TIMINGS. They decide whether two
 * frames count as the same frame, so they decide whether a story is reported settled or never
 * settled - the ending a developer reads. Falling back to the app's own config would be falling back
 * to the SDK's defaults on an app that has never taken a test run, which is the app a capture runs
 * on, and a capture would then call a story never-settled that the run settles.
 */
export type CaptureSettings = {
  requiredMatches?: number;
  minScreenshotsCount?: number;
  intervalMs?: number;
  timeoutMs?: number;
  threshold?: number;
  includeAA?: boolean;
};

/** What the bundler hands an app that has been waiting: the instruction to act on. */
export type CaptureInstruction = {
  /** The app is not in testing mode; restart there, and the capture waits for the app that returns. */
  restartIntoTesting?: boolean;
  /** The story to capture, sent only to an app already in testing mode. */
  storyId?: string;
  /** How to stabilize the story, sent with it. */
  settings?: CaptureSettings;
};

/** What the app asks of the bundler, and nothing else. */
export type CaptureTransport = {
  /**
   * Hold a request open at the bundler until there is a capture for this app, saying what mode it is
   * in, what stories it has, and the answer to the capture it was last handed. Resolves with an
   * empty answer when the hold ran out with nothing posted.
   */
  waitForACapture(saying: {
    mode: string;
    stories: string[];
    answer: CapturedAnswer | null;
  }): Promise<CaptureInstruction>;
};

let collecting = false;

/**
 * Start waiting on the bundler's capture address. Idempotent - a second call while the first is
 * still collecting is a no-op, because there is one app and one channel to walk stories on.
 *
 * `capture` defaults to the bundler this app's JavaScript came from. A built app's JavaScript came
 * from inside the app, so there is no bundler beside it and no address to wait on: nothing starts,
 * and `sherlo capture` is refused by the tool rather than waited on by anybody.
 */
export function startCaptureTransport({
  view,
  channel,
  capture,
}: {
  view: StorybookView;
  channel: StorybookChannel | null;
  capture?: CaptureTransport | null;
}): void {
  if (collecting || !channel) return;

  const road = capture === undefined ? bundlerCapture() : capture;
  if (!road) return;

  // The same tracker the test run uses: it buffers the story last rendered, which is what
  // waitForStoryRendered reads after a story is put on screen.
  startStoryRenderedTracking(channel);

  collecting = true;
  collectCaptures({ view, channel, capture: road });
}

/** Stop waiting. The request already in flight is left to finish and its answer dropped. */
export function stopCaptureTransport(): void {
  collecting = false;
}

/* ========================================================================== */

async function collectCaptures({
  view,
  channel,
  capture,
}: {
  view: StorybookView;
  channel: StorybookChannel;
  capture: CaptureTransport;
}): Promise<void> {
  let answer: CapturedAnswer | null = null;

  while (collecting) {
    let asked: CaptureInstruction;

    try {
      asked = await capture.waitForACapture({
        mode: SherloModule.getMode(),
        stories: storiesIn(view),
        answer,
      });
    } catch (_e) {
      await delay(RETRY_AFTER_SILENCE_MS);
      continue;
    }

    if (!collecting) return;

    // The answer has crossed the socket; do not send it twice.
    answer = null;

    if (asked.restartIntoTesting) {
      // This app is on its way out: changing mode restarts it, and the capture waits for the app
      // that comes back in testing mode. Stop waiting here rather than ask again - the app that
      // returns collects the capture instead.
      collecting = false;
      SherloModule.openTesting();
      return;
    }

    if (!asked.storyId) continue;

    answer = await captureTheStory({ storyId: asked.storyId, settings: asked.settings, channel });
  }
}

/**
 * Walk one story the way a test run does, and answer what was recorded.
 *
 * A story that threw while rendering still counts as captured - the error view is what is on screen
 * - and the fact it threw is reported alongside the tree. A story whose walk itself failed (the
 * inspector never answered, say) is a crash: the app stops and says why.
 */
async function captureTheStory({
  storyId,
  settings,
  channel,
}: {
  storyId: string;
  settings: CaptureSettings | undefined;
  channel: StorybookChannel;
}): Promise<CapturedAnswer> {
  try {
    await waitForTheStoryOnScreen({ storyId, channel });
    const settled = await stabilizeTheStory(settings);

    // Asking how many screenfuls the story is puts it back at its top, so it is asked before the
    // tree is read: the tree a capture records is the story as it renders from the beginning.
    //
    // A BROKEN STORY IS NOT MEASURED, because a run does not measure one: the run reads the story's
    // error before it measures anything, so the story it hands over counts as one screenful however
    // tall the view on screen is. Measuring the error view instead would tell the developer their
    // story scrolls when what scrolls is the fallback drawn in its place.
    const parts = theStoryIsBroken(storyId) ? 1 : await screenfulsOfTheStory();
    const recorded = await readTheStory(storyId);

    const threw = whatTheStoryThrew(storyId);
    return {
      kind: 'captured',
      storyId,
      settled,
      ...(threw && { threw }),
      parts,
      hasNetworkImage: recorded.hasNetworkImage,
      tree: recorded.tree,
      waited: recorded.waited,
      root: recorded.root,
    };
  } catch (error) {
    const report = readError(error);
    return { kind: 'crashed', storyId, ...(report && { error: report }) };
  }
}

/**
 * Put the story on screen and wait until it has rendered and painted, as a test run does.
 *
 * THE FIRST TELLING CAN LOSE A RACE THAT ONLY EXISTS ON A CAPTURE'S RESTART. Storybook is booting up
 * this same instant, with no `initialSelection` to land on (see the file header) - so this call and
 * Storybook's own default-selection effect are both trying to decide what is on screen, and whichever
 * finishes last wins. A capture told once and asleep for STORY_RENDERED has no way to tell the two
 * outcomes apart: "the app has not gotten to it yet" and "the app already overwrote it" both look like
 * silence. So this keeps telling it again - not merely once, and not only for the first story of a
 * session - every SELECT_STORY_RETRY_INTERVAL_MS until STORY_RENDERED names this exact story, which is
 * the one signal that says the race is over and nothing is going to move Storybook off of it again.
 */
async function waitForTheStoryOnScreen({
  storyId,
  channel,
}: {
  storyId: string;
  channel: StorybookChannel;
}): Promise<void> {
  // A capture writes nothing to the device (see the file header), so there is usually no config to
  // read here - that absence is a normal state, not an error, and falls back to the SDK's own
  // defaults rather than throwing.
  const config = SherloModule.getConfigOrDefault();
  const timeoutMs = config.storyRenderedTimeoutMs ?? STORY_RENDERED_TIMEOUT_MS;
  const startedAt = Date.now();

  // The story was handed over by name; put it on screen the way Storybook moves between stories,
  // then wait for it to be reported rendered - re-telling it, inside the same overall ceiling a
  // single telling already had, until it is.
  channel.emit(SET_CURRENT_STORY, { storyId });
  let readiness = await waitForStoryRendered({
    storyId,
    timeoutMs: Math.min(SELECT_STORY_RETRY_INTERVAL_MS, timeoutMs),
    channel,
  });

  while (!readiness.rendered && Date.now() - startedAt < timeoutMs) {
    channel.emit(SET_CURRENT_STORY, { storyId });
    const remainingMs = Math.max(timeoutMs - (Date.now() - startedAt), 0);
    readiness = await waitForStoryRendered({
      storyId,
      timeoutMs: Math.min(SELECT_STORY_RETRY_INTERVAL_MS, remainingMs),
      channel,
    });
  }

  // Close the last-frame gap before stabilizing, best-effort: the stability loop runs afterwards
  // regardless - the same fallthrough a run itself takes when STORY_RENDERED never came (see
  // awaitStoryReadyAndPaint), so a story that genuinely never rendered is stabilized and recorded
  // rather than left to hang.
  await SherloModule.awaitFrameCommit(
    config.paintBarrierTimeoutMs ?? PAINT_BARRIER_TIMEOUT_MS
  ).catch(() => false);
}

/**
 * Run the stability loop the way a test run does, and say how it ended. A capture saves no
 * screenshots, so saveScreenshots is off and nothing is written to the device.
 *
 * EVERY value the tool sent is used, and the app's own config is read only for what it did not send.
 * That order matters most for threshold and includeAA: they are what decide whether the screen counts
 * as settled, so taking them from the app instead would let a capture disagree with the run about the
 * ending itself.
 */
async function stabilizeTheStory(
  settings: CaptureSettings | undefined
): Promise<{ ms: number; frames: number } | 'timed-out'> {
  // Same absence, same fallback as waitForTheStoryOnScreen above.
  const config = SherloModule.getConfigOrDefault();
  const stabilization = config.stabilization;

  const frames = settings?.minScreenshotsCount ?? stabilization.minScreenshotsCount;

  const startedAt = Date.now();
  const isStable = await SherloModule.stabilize(
    settings?.requiredMatches ?? stabilization.requiredMatches,
    settings?.minScreenshotsCount ?? stabilization.minScreenshotsCount,
    settings?.intervalMs ?? stabilization.intervalMs,
    settings?.timeoutMs ?? stabilization.timeoutMs,
    false, // a capture records a tree, not screenshots
    settings?.threshold ?? stabilization.threshold,
    settings?.includeAA ?? stabilization.includeAA
  );

  return isStable ? { ms: Date.now() - startedAt, frames } : 'timed-out';
}

/**
 * How many screenfuls the story is, asked of the scroll view the story is drawn in.
 *
 * A test run splits a story that scrolled past its first screen into parts, and the tool tells the
 * developer when a story it captured would have been split - so the count has to come from the same
 * place the run's scrolling does. The native side only reports the story's size while it is
 * scrolling it, so this asks for the checkpoint at the very top: the story is where it already is,
 * and the answer carries the screen's height and the story's own.
 *
 * One screenful whenever the story does not scroll, and whenever the native side answered with no
 * measurements - a story that cannot scroll is one screenful by definition, and a number invented
 * from nothing would be worse than saying nothing.
 */
async function screenfulsOfTheStory(): Promise<number> {
  const scrollable = await SherloModule.isScrollable().catch(() => ({ scrollable: false }));
  if (!scrollable.scrollable) return 1;

  const measured = await SherloModule.scrollToCheckpoint(0, 0, 0).catch(() => undefined);
  if (!measured || measured.viewportPx <= 0 || measured.contentPx <= 0) return 1;

  return Math.ceil(measured.contentPx / measured.viewportPx);
}

/**
 * What a capture recorded of the story: its view tree, whether anything on screen is loaded over
 * the network, how the two waits below went, and what the tree is rooted at. The tree and the
 * network fact are read off the one step that prepares the tree, so a capture and a test run
 * cannot answer differently about the same story; the waits and the root are what that agreement
 * alone could never say - see WaitOutcome.
 */
type RecordedStory = {
  tree: CapturedViewTree;
  hasNetworkImage: boolean;
  waited: {
    metadata: WaitOutcome;
    storyViews: WaitOutcome & { rereads: number };
  };
  root: { at: 'story' | 'window'; nodeCount: number };
};

/**
 * Read the story off the native inspector, retrying the way a test run does.
 *
 * THE METADATA IS READ FIRST, AND THE INSPECTOR IS RE-READ UNTIL ITS OWN TREE HOLDS THE STORY - not
 * merely once, and not merely once the metadata names it. prepareInspectorData pairs the two
 * readings by native tag (fabricMetadata.viewProps[node.id]), so they only describe the same view
 * tree when the inspector's own tree actually contains the view that tag names. The metadata can
 * already name the story - JavaScript has rendered it - while the inspector still answers with the
 * app's shell, because the native views for that story have not mounted yet (see
 * STORY_VIEWS_TIMEOUT_MS below). Reading the inspector once and trusting a metadata match alone
 * would re-root against a tree with no such node in it - the same window-instead-of-story bug
 * metadataOfTheApp already closes on its own clock, reopened one clock later.
 */
async function readTheStory(storyId: string): Promise<RecordedStory> {
  const { metadata, wait: metadataWait } = await metadataOfTheApp(storyId);
  const { inspectorData, wait: storyViewsWait } = await inspectorDataOfTheApp(storyId, metadata);

  const { tree, hasNetworkImage, at } = await theStorysOwnTree(inspectorData, metadata, storyId);

  return {
    tree,
    hasNetworkImage,
    waited: { metadata: metadataWait, storyViews: storyViewsWait },
    root: { at, nodeCount: countNodes(tree) },
  };
}

/** How many nodes a recorded tree holds, root included. */
function countNodes(tree: CapturedViewTree): number {
  return 1 + tree.children.reduce((total, child) => total + countNodes(child), 0);
}

/**
 * Read the app's whole window off the native inspector, retrying the way a test run does - and,
 * once the app's own reading already names this story, re-reading until the story's own views are
 * actually in that window rather than reading once and hoping.
 *
 * NO METADATA, OR A BROKEN STORY, SKIPS THE SECOND WAIT. theStorysOwnTree never re-roots either case
 * (below), so polling for a node it will never look for would spend the ceiling for nothing - the
 * same reasoning theStoryIsBroken is read for everywhere else in this file.
 *
 * A TIMEOUT HERE IS NOT A CRASH. Giving up leaves inspectorData exactly as it last answered, and the
 * honest answer is still what that was: theStorysOwnTree re-roots it if the story's node turned out
 * to be there, and records the whole window if not.
 *
 * THE WAIT ITSELF IS HANDED BACK ALONGSIDE THE READING, because the reading alone cannot say which
 * of those two endings it was - a tree with the story's node in it and a tree without one look the
 * same until something asks whether the node is there, which is exactly what this wait already
 * asked and theStorysOwnTree is about to ask again.
 */
async function inspectorDataOfTheApp(
  storyId: string,
  metadata: ReturnType<typeof collectAppMetadata>
): Promise<{ inspectorData: InspectorData; wait: WaitOutcome & { rereads: number } }> {
  const startedAt = Date.now();
  let inspectorData = await theInspectorsOwnAnswer();

  // No metadata, or a broken story: theStorysOwnTree never re-roots either case (see there), so
  // there is nothing this wait could usefully poll for - one read is the whole of it.
  if (!metadata || theStoryIsBroken(storyId, inspectorData)) {
    return {
      inspectorData,
      wait: { outcome: 'first-check', ms: Date.now() - startedAt, rereads: 0 },
    };
  }

  let rereads = 0;
  while (
    !theStorysViewsAreInTheTree(inspectorData, metadata, storyId) &&
    Date.now() - startedAt < STORY_VIEWS_TIMEOUT_MS
  ) {
    await delay(STORY_VIEWS_POLL_INTERVAL_MS);
    inspectorData = await theInspectorsOwnAnswer();
    rereads += 1;
  }

  const found = theStorysViewsAreInTheTree(inspectorData, metadata, storyId);
  const outcome: WaitOutcome['outcome'] = !found
    ? 'timed-out'
    : rereads === 0
    ? 'first-check'
    : 'polled';

  return { inspectorData, wait: { outcome, ms: Date.now() - startedAt, rereads } };
}

/** Keep asking the native inspector until it answers at all, giving up after INSPECTOR_TIMEOUT_MS. */
async function theInspectorsOwnAnswer(): Promise<InspectorData> {
  let inspectorData: InspectorData | undefined;
  const startedAt = Date.now();

  while (!inspectorData) {
    if (Date.now() - startedAt > INSPECTOR_TIMEOUT_MS) {
      throw new Error('getInspectorData timed out after 10s');
    }
    inspectorData = await SherloModule.getInspectorData().catch(() => undefined);
  }

  return inspectorData;
}

/**
 * Whether the inspector's OWN tree - the native view hierarchy it just answered with, not the app's
 * published reading of it - already holds the view Storybook wraps this story in: the same view
 * prepareInspectorData re-roots the tree at. Checked by the same two conditions prepareInspectorData
 * uses to find that node (properties.testID === storyId, and the node has at least one child), so a
 * tree this accepts is a tree prepareInspectorData can actually re-root.
 */
function theStorysViewsAreInTheTree(
  inspectorData: InspectorData,
  metadata: ReturnType<typeof collectAppMetadata>,
  storyId: string
): boolean {
  if (!metadata) return false;
  const viewProps = metadata.viewProps;

  function nodeIsTheStorysRoot(node: InspectorDataNode): boolean {
    if (viewProps[node.id]?.testID === storyId) {
      return Array.isArray(node.children) && node.children.length > 0;
    }
    return (node.children ?? []).some(nodeIsTheStorysRoot);
  }

  return nodeIsTheStorysRoot(inspectorData.viewHierarchy);
}

/**
 * The story a capture records, starting where a test run's story starts.
 *
 * The inspector answers with the app's whole window, which holds Sherlo's own frame, Storybook's,
 * and the view Storybook wraps a story in. The one step that knows where the story begins among all
 * of that is the step the test run hands its tree to (prepareInspectorData): it re-points the tree
 * at the view carrying the story's own id, names every view by the class the fiber drew it by, and
 * says whether anything on screen is loaded over the network. A capture records the same story, so
 * it takes all three from that one step rather than reading the window a second way of its own.
 *
 * The step needs the app's view metadata, which a run holds as a React ref and a capture, having no
 * renderer, reads from the seam the renderer publishes it on (./appMetadata) - already waited for by
 * the caller (metadataOfTheApp, read in readTheStory before the inspector itself) so that it names
 * this story and was read at the same moment as the inspector data handed in here. With no metadata
 * published - nothing rendered this app the way a run renders it - there is no story to start at
 * and no image to report: what the inspector answered is recorded as it stands, the whole window
 * rather than the story.
 *
 * A BROKEN STORY IS NOT RE-ROOTED, because a run does not re-root one. The run skips that step
 * whenever the story contains an error and keeps the inspector's tree as it answered it
 * (useTestStory), so a capture that prepared a thrown story would record a tree no run ever makes -
 * more thorough than the run at the one moment the story is broken, which is the opposite of what a
 * capture is for. Both states that make a run skip it are read here: the error the boundary recorded
 * and the words that stand in for a story that failed to render (see theStoryIsBroken).
 */
async function theStorysOwnTree(
  inspectorData: InspectorData,
  metadata: ReturnType<typeof collectAppMetadata>,
  storyId: string
): Promise<{ tree: CapturedViewTree; hasNetworkImage: boolean; at: 'story' | 'window' }> {
  if (!metadata || theStoryIsBroken(storyId, inspectorData)) {
    return {
      tree: captureViewTree(inspectorData.viewHierarchy, componentNamesByNativeTag()),
      hasNetworkImage: false,
      at: 'window',
    };
  }

  // The same question inspectorDataOfTheApp's own wait already asked, of the same reading it
  // handed back: whether the story's node actually made it into this tree. prepareInspectorData
  // re-roots at that node when it is there and leaves the window alone when it is not, so this is
  // what the tree about to be built is rooted at - not a guess made after the fact.
  const at = theStorysViewsAreInTheTree(inspectorData, metadata, storyId) ? 'story' : 'window';
  const prepared = prepareInspectorData(inspectorData, metadata, storyId);

  return {
    tree: captureViewTree(prepared.inspectorData.viewHierarchy, componentNamesByNativeTag()),
    hasNetworkImage: prepared.hasNetworkImage,
    at,
  };
}

/**
 * The app's own reading of its views (../appMetadata) - but only once that reading NAMES THE STORY
 * this capture asked for, not merely once a reading exists.
 *
 * A reading can be published and still be about the wrong screen: on the FIRST capture after a
 * restart, the app has just booted, something rendered, the effect published a reading of THAT, and
 * the story this capture asked for had not been drawn into it yet - the inspector answers over a
 * socket and can report the story rendered before that reading catches up to it. A reading that
 * exists but does not name this story would satisfy a poll that only checked for existence, and
 * prepareInspectorData would then find no view carrying the story's id to re-root at - silently
 * recording the app's whole window instead of the story, which is exactly the bug this wait exists
 * to close. Every later capture in the same session finds a reading that already names its story and
 * returns on the first check.
 *
 * `metadata` is `undefined` when the wait ran out without ever seeing a reading that names this
 * story - the same "nothing rendered this app" state theStorysOwnTree already falls back to, just
 * no longer mistaking a reading of the wrong screen for it. `wait` says which of the three ways the
 * wait ended, and how long it took - see WaitOutcome.
 */
async function metadataOfTheApp(
  storyId: string
): Promise<{ metadata: ReturnType<typeof collectAppMetadata>; wait: WaitOutcome }> {
  const startedAt = Date.now();
  let metadata = collectAppMetadata();
  let checks = 1;

  while (!namesTheStory(metadata, storyId) && Date.now() - startedAt < METADATA_TIMEOUT_MS) {
    await delay(METADATA_POLL_INTERVAL_MS);
    metadata = collectAppMetadata();
    checks += 1;
  }

  const named = namesTheStory(metadata, storyId);
  const outcome: WaitOutcome['outcome'] = !named
    ? 'timed-out'
    : checks === 1
    ? 'first-check'
    : 'polled';

  return { metadata: named ? metadata : undefined, wait: { outcome, ms: Date.now() - startedAt } };
}

/**
 * Whether a reading of the app's views carries the view Storybook wraps this story in - the same
 * view prepareInspectorData re-roots the tree at (testID === storyId). Checked here by the same key
 * prepareInspectorData reads it by, so a reading this function accepts is a reading prepareInspectorData
 * can actually re-root the tree with.
 */
function namesTheStory(metadata: ReturnType<typeof collectAppMetadata>, storyId: string): boolean {
  if (!metadata) return false;
  return Object.values(metadata.viewProps).some((props) => props.testID === storyId);
}

/**
 * Whether the story on screen is broken, by the run's own two readings of it (useTestStory gives the
 * same two to `containsError`): the error the boundary recorded for the story, or the words that
 * stand in for a story that failed to render.
 *
 * BOTH ARE READ BECAUSE EITHER CAN BE TRUE WITHOUT THE OTHER. Sherlo's own boundary records the
 * error and then throws it on, so an error the next boundary out is the one that draws leaves the
 * registry empty while the words are on screen. A capture that read only one of the two would go on
 * to re-root a story a run would leave alone, which is the divergence this gate exists to close.
 *
 * `false` while no app has published its views, which is not this: a story nothing rendered the way
 * a run renders it is left alone for a plainer reason (see theStorysOwnTree).
 *
 * THE FALLBACK WORDS ARE CHECKED AGAINST THE LIVE INSPECTOR READING, NOT AGAINST EVERY GENERATION
 * THIS APP HAS EVER PUBLISHED. A capture's FIRST story of a boot is put on screen by moving
 * Storybook off whatever it booted onto by itself (see waitForTheStoryOnScreen) - so the app's
 * published metadata (./appMetadata) can still be carrying the PREVIOUS story's own fallback text,
 * merged in from a fiber generation this exact story switch has already moved past (see
 * `Metadata.generations`). A blanket check across every generation would call THIS story broken
 * because an EARLIER one was - the same window-instead-of-story bug this whole file exists to
 * close, one gate later. Passed `inspectorData` (the native, unambiguously current reading) is
 * what tells the two apart: only a generation whose OWN testID-carrying view is still live in it
 * is read for the fallback text. Every caller that already has an inspector reading in hand passes
 * it; the one caller that does not (captureTheStory's own use, before the walk that would produce
 * one) falls back to the merged reading, the same check this always did.
 */
function theStoryIsBroken(storyId: string, inspectorData?: InspectorData): boolean {
  if (readStoryError(storyId) !== undefined) return true;

  const metadata = collectAppMetadata();
  if (!metadata) return false;

  if (!inspectorData) return metadata.texts.includes(STORY_ERROR_FALLBACK_TEXT);

  const liveTags = liveNativeTags(inspectorData.viewHierarchy);
  const liveGeneration = (metadata.generations ?? [metadata]).find((generation) =>
    Object.entries(generation.viewProps).some(
      ([tag, props]) => props.testID === storyId && liveTags.has(Number(tag))
    )
  );

  return (liveGeneration ?? metadata).texts.includes(STORY_ERROR_FALLBACK_TEXT);
}

/** Every native tag the live inspector reading currently holds a view for, root included. */
function liveNativeTags(node: InspectorDataNode): Set<number> {
  const tags = new Set<number>();

  function visit(current: InspectorDataNode): void {
    tags.add(current.id);
    (current.children ?? []).forEach(visit);
  }

  visit(node);
  return tags;
}

/**
 * One view tree as the command prints it: the primitive the view is drawn by, and the app's
 * component names above it. The names are read from the fibers the story was rendered from, keyed
 * by the same native tag the inspector reports for the view, so a view the app did not render is
 * simply absent from that reading and comes out nameless.
 */
function captureViewTree(
  node: InspectorDataNode,
  names: ComponentNamesByNativeTag
): CapturedViewTree {
  return {
    primitive: thePrimitiveTheCommandPrints(node.className),
    components: names.get(node.id) ?? [],
    children: (node.children ?? []).map((child) => captureViewTree(child, names)),
  };
}

/**
 * The word the command prints for a view, by the class that draws it.
 *
 * A native class is named for the platform, not for the developer reading the tree: Android names
 * its views after the Java class that draws them (`ReactTextView`), and iOS after its own prefix
 * (`RCTText`), which is also the name a fiber draws a view by on both platforms. The command
 * prints `View`, `Text` and `Image`, so the two are paired here.
 *
 * AN EXPLICIT TABLE, NOT A STRIPPED PREFIX. The pairings below are the contract between this SDK
 * and what `sherlo capture` prints, so correcting one is one line here. A view drawn by a class
 * this table does not pair keeps its own name: a name this file guessed would be worse than a name
 * a developer can look up, and a primitive invented for an unknown view would be a lie.
 */
const PRIMITIVE_BY_DRAWING_CLASS: Record<string, string> = {
  ReactViewGroup: 'View',
  ReactTextView: 'Text',
  ReactImageView: 'Image',
  ReactScrollView: 'ScrollView',

  RCTView: 'View',
  RCTText: 'Text',
  RCTVirtualText: 'Text',
  RCTImageView: 'Image',
  RCTScrollView: 'ScrollView',
};

/** The primitive the command prints for the class a view is drawn by, or nothing when it said none. */
function thePrimitiveTheCommandPrints(drawingClass: unknown): string {
  if (typeof drawingClass !== 'string') return '';
  return PRIMITIVE_BY_DRAWING_CLASS[drawingClass] ?? drawingClass;
}

/**
 * What the story on screen threw while rendering, or null when it drew cleanly. Read from the
 * registry the error boundary fills and the runner already reads (./getStorybook/storyErrorRegistry)
 * - there is ONE way of knowing a story is broken in this SDK, and this is another reader of it.
 */
function whatTheStoryThrew(storyId: string): StoryThrew | null {
  const recorded = readStoryError(storyId);
  return recorded ? { name: recorded.name, message: recorded.message } : null;
}

/** An error's own name and message, or nothing when it said nothing readable. */
function readError(error: unknown): StoryThrew | undefined {
  const said = error as { name?: unknown; message?: unknown } | null | undefined;
  if (typeof said?.name === 'string' && typeof said?.message === 'string') {
    return { name: said.name, message: said.message };
  }
  return undefined;
}

/** Every story this app has, as Storybook's own index inside it knows them. */
function storiesIn(view: StorybookView): string[] {
  const index = (view as unknown as { _storyIndex?: { entries?: Record<string, unknown> } })
    ._storyIndex;
  return index?.entries ? Object.keys(index.entries) : [];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The capture address on the bundler this app's JavaScript came from, or null when it did not come
 * from one. React Native names that bundler in the url it loaded the bundle from; a built app names
 * a file on the device instead, and a file has no capture address.
 */
export function bundlerCapture(): CaptureTransport | null {
  const origin = bundlerOrigin();
  if (!origin) return null;

  return {
    waitForACapture: async (saying) => {
      const giveUp = new AbortController();
      const timer = setTimeout(() => giveUp.abort(), HOLD_TIMEOUT_MS);

      try {
        const response = await fetch(origin + CAPTURE_PATH, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saying),
          // React Native's own declaration of a fetch signal is not the standard one this
          // controller produces, though the runtime object is the same - hence the cast.
          signal: giveUp.signal as unknown as RequestInit['signal'],
        });
        const answer = (await response.json()) as CaptureInstruction;
        return answer && typeof answer === 'object' ? answer : {};
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function bundlerOrigin(): string | null {
  const sourceCode = NativeModules.SourceCode as
    | { getConstants?: () => { scriptURL?: string }; scriptURL?: string }
    | undefined;
  const scriptURL = sourceCode?.getConstants?.().scriptURL ?? sourceCode?.scriptURL;
  if (typeof scriptURL !== 'string') return null;

  const origin = /^(https?:\/\/[^/]+)/.exec(scriptURL);
  return origin ? origin[1] : null;
}
