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
 * THE FIRST STORY OF A SESSION IS HANDED OVER AT BOOT, THE SAME WAY A RUN HANDS ONE OVER. The relay
 * already knows which story the tool is waiting for at the exact moment it tells this app to restart
 * into testing mode (see metro/captureSocket.js), so that instruction carries the story id along with
 * it. This file passes it straight to `SherloModule.openTesting`, which hands it to the native side to
 * land on as `initialSelection` the way a run's restart always has a story to land on - so the app
 * that comes back boots directly onto the story instead of Storybook's own placeholder.
 *
 * THE RETRY BELOW IS A SAFETY NET NOW, NOT THE ONLY DEFENSE. An app whose native side is older than
 * this hand-over, or one the relay could not reach a storyId for, still comes back with no
 * `initialSelection` and boots onto Storybook's own default selection - the exact race this file's
 * retry exists to win (see waitForTheStoryOnScreen). Every story after the first was always reached
 * this way too, moving Storybook off a story already on screen rather than off a boot-time
 * placeholder, and still is.
 *
 * THE TREE STARTS WHERE THE RUN'S TREE STARTS. The app's window holds more than the story: Sherlo's
 * own frame, Storybook's, the story view Storybook wraps a story in. A test run collapses all of it
 * by handing the inspector's tree to the one step that knows where a story begins
 * (./getStorybook/components/TestingMode/useTestAllStories/prepareInspectorData), and a capture
 * records the same tree, so it goes through that same step rather than a second reading of its own.
 * That step needs the app's view metadata, which the run holds as a React ref and a capture, having
 * no renderer, reads from the seam the renderer publishes it on (./appMetadata).
 *
 * NO TEST-RUN ARTIFACT IS EVER WRITTEN. A test run saves screenshots and writes the protocol file;
 * a capture needs neither, so it stabilizes with saveScreenshots off and never appends to a file
 * from here - the view tree comes straight from the native inspector, over the socket, in memory the
 * whole way. This is narrower than "nothing touches storage" (an earlier version of this comment said
 * exactly that): handing the first story over at boot has to survive the SAME restart a run's own
 * story hand-over already had to survive, and on Android that restart is a full process kill
 * (ProcessPhoenix), which no in-memory value can live through. Surviving it needs a persisted flag -
 * but not a new kind of one. Android's mode itself already crosses this exact restart through a
 * SharedPreferences slot sized in seconds and read once (RestartHelper.persistMode /
 * getPersistedMode) - not the protocol/screenshot storage this invariant was written to keep clear
 * of, which is where a run's own evidence lives and where a stray capture write would corrupt it. The
 * story id now rides in that same short-lived slot, read back once and cleared, never touching the
 * files a run's own artifacts live in. iOS never had to add anything: its restart is a same-process
 * bridge reload (see ios/RestartHelper.m), so the story id survives as the plain in-memory value
 * SherloModuleCore already carries mode in.
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
 *
 * AND, WHEN IT IS ROOTED AT THE WINDOW, WHY - because "window" alone leaves a reader guessing among
 * every branch that can produce it, the same guessing eight rounds of this epic already did from
 * outside the device. `theStorysOwnTree` takes that branch for one of two reasons - no reading of
 * the app's views ever named the story, or the story on screen is broken - and, when it is broken,
 * by one of two readings of its own - the error registry, or the fallback words, and if the words,
 * which fiber generation the live-tag check picked them from (see the file's own note on generations
 * further down). A third way the window is recorded needs no naming beyond what `waited.storyViews`
 * already carries: the metadata named the story and it was not broken, but the inspector's own tree
 * never grew the story's views before the wait for that gave up. `root.reason` names whichever of
 * these fired, read off the same checks that decided `root.at` rather than guessed at afterwards.
 */
import { NativeModules } from 'react-native';
import SherloModule from './SherloModule';
import { InspectorData, InspectorDataNode, StorybookView } from './types';
import { componentNamesByNativeTag, type ComponentNamesByNativeTag } from './componentNames';
import { collectAppMetadata, providerFirstRenderedAt } from './appMetadata';
import { STORY_ERROR_FALLBACK_TEXT } from './constants';
import { prepareInspectorData } from './getStorybook/components/TestingMode/useTestAllStories/prepareInspectorData';
import { readStoryError } from './getStorybook/storyErrorRegistry';
import {
  startStoryRenderedTracking,
  waitForStoryRendered,
  type StorybookChannel,
} from './getStorybook/components/TestingMode/useTestAllStories/storyRenderedReadiness';
import { setCaptureLogSink } from './helpers/RunnerBridge/captureLogSink';

const SET_CURRENT_STORY = 'setCurrentStory';

/** The one address Sherlo adds to the bundler; the other half of it is metro/captureSocket.js. */
const CAPTURE_PATH = '/sherlo/capture';

/**
 * The address a capture pushes its own log lines to, live - the other half is
 * metro/captureLogSocket.js. A plain append, never held open: the app posts and moves on, so a line
 * reaches the bundler's own memory (a process that outlives the app's own crash) the instant
 * RunnerBridge.log forms it, rather than waiting on whatever this capture's own walk is doing (see
 * ./helpers/RunnerBridge/captureLogSink.ts).
 */
const CAPTURE_LOG_PATH = '/sherlo/capture-log';

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

/**
 * How long waitForTheStoryOnScreen leaves Storybook's own story index to finish loading, once
 * SELECT_STORY_RETRY_INTERVAL_MS's own retries have already given up - see the ready-driven wait in
 * that function for the race this exists to close, one this SDK cannot win by asking again sooner.
 *
 * A SEPARATE CLOCK FROM STORY_RENDERED_TIMEOUT_MS, ON PURPOSE. How long a story index takes to finish
 * loading and how long an already-loaded story takes to paint are two different questions - folding
 * the first into the second's much shorter budget is exactly the "a timer would make this rarer on
 * fast devices and no better on slow ones" failure this file's own history already lived through once
 * (see waitForTheStorysOwnViews's own account of eleven rounds of tuning a single guessed number).
 * 15s matches METADATA_TIMEOUT_MS / STORY_VIEWS_TIMEOUT_MS below - the other ceilings in this file
 * sized for something a real device may simply take a while to finish, not for a fast path.
 */
const STORYBOOK_READY_TIMEOUT_MS = 15000;

/** How often the wait above re-checks Storybook's own readiness, between one poll and the next. */
const STORYBOOK_READY_POLL_INTERVAL_MS = 10;

/** How long a test run lets the paint barrier run before the stability loop proceeds. */
const PAINT_BARRIER_TIMEOUT_MS = 1000;

/** How long a test run keeps asking the inspector for the view tree before it gives up. */
const INSPECTOR_TIMEOUT_MS = 10000;

/**
 * How long a capture waits for the app to publish a reading of ITS OWN STORY (./appMetadata) before
 * it gives up and fails the capture (see waitForTheStorysOwnViews). On every ordinary check the
 * published reading already names the story on the first poll, so this ceiling costs nothing in the
 * paths that are not racing anything.
 *
 * THE RACE THIS ONCE HAD TO SURVIVE IS CLOSED AT THE SOURCE, NOT WAITED OUT. A capture's FIRST story
 * of a boot used to lose this exact race: MetadataProvider published from an effect - first a passive
 * one (useEffect), then a layout one (useLayoutEffect) - and either kind loses to Storybook's own
 * "story rendered" signal by construction, not by luck. MetadataProvider is the PARENT of the story
 * Storybook renders below it (see TestingMode.tsx), and React always runs a child's effects, of
 * either kind, before its parent's - so whatever inside Storybook's tree fires "story rendered" was
 * always going to finish first, whichever effect hook MetadataProvider published from. That recorded
 * the window with what the code then called `root.reason.cause: 'no-metadata'` (a single cause, before
 * it was split - see WindowReason), never on the second story or the third, because only the first
 * ever raced a fresh mount. MetadataProvider now publishes from its render body, before `children`
 * (Storybook, the story below it) is even returned - ahead of the whole subtree's render, not merely
 * ahead of its effects, so nothing racing THIS can observe the reading unset (see MetadataProvider.tsx).
 * What this ceiling still bounds is everything else that can leave a reading unpublished a beat
 * longer: render work still queued behind other work on a loaded device for the FIRST commit of an
 * app whose native side is old enough to have no `initialSelection` to hand over (see the file
 * header) - so it is sized like the command's other genuine give-ups (INSPECTOR_TIMEOUT_MS at 10s),
 * not like a fast-path poll.
 *
 * THIS RACE WAS REAL AND IS STILL CLOSED, BUT IT WAS NOT THE WHOLE STORY. A later measurement on a
 * real device found the first story of a boot still recording `cause: 'story-unnamed'` long after
 * this fix landed - MetadataProvider had rendered and published SEVEN SECONDS before the poll even
 * started, answering, and still never naming the first story - which this race could not have caused
 * (it is a race against effects, and seven seconds is not a lost race, it is something else). What
 * that something else is remains open; see `'story-unnamed'` on WindowReason.
 *
 * WIDENED FROM 2000MS TO 15000MS WHEN THIS BECAME LOAD-BEARING (sherlo-capture-refuses-to-
 * photograph-the-window). Two seconds was chosen for a best-effort check nobody acted on; a gate
 * that can now fail the whole capture must not be the thing that turns a slow-but-working app into
 * a false negative. 15s is generous enough to survive a first boot loading the whole story index on
 * a loaded device - the same class of work INSPECTOR_TIMEOUT_MS already gives 10s to survive one
 * clock over - while still only costing a genuinely broken story 15 extra seconds, not minutes.
 */
const METADATA_TIMEOUT_MS = 15000;

/** How often the wait above re-checks, between one short wait and the next. */
const METADATA_POLL_INTERVAL_MS = 10;

/**
 * How many of the testIDs a diagnostic reading holds are kept, at most - see
 * WindowReason.testIdsAtGiveUp and testIdsLiveInTheInspector. Answering "empty, or some other
 * story's" needs a few names, not the whole reading, so an app whose screen happens to carry an
 * unusual number of testIDs cannot grow a diagnostic past a handful.
 */
const MAX_TEST_IDS_IN_DIAGNOSTICS = 5;

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
 *
 * WIDENED FROM 2000MS TO 15000MS ALONGSIDE METADATA_TIMEOUT_MS ABOVE, same reasoning and same
 * number: this ceiling is now load-bearing too (see waitForTheStorysOwnViews), and a real device's
 * first-boot mounting work deserves the same room to finish as a first-boot story-index load does.
 */
const STORY_VIEWS_TIMEOUT_MS = 15000;

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
 * WHY `theStorysOwnTree` recorded the window rather than the story - the branch it took, carried
 * out instead of thrown away. See the file header's own paragraph on this.
 */
export type WindowReason =
  /**
   * The app never published ANY reading of its views, of any story, at any point this poll ran
   * (see metadataOfTheApp) - nothing rendered this app the way a run renders it. Carries when
   * MetadataProvider - the component that would have published one - first rendered in this boot,
   * relative to when this poll began, because the provider can still have rendered ONCE, earlier in
   * this same boot, and then been withdrawn (unmounted) before this poll ever started - `undefined`
   * is that it never rendered at all.
   *
   * SPLIT FROM A SINGLE `'no-metadata'` CAUSE THAT USED TO COVER THIS AND `'story-unnamed'` BOTH
   * (sherlo-capture-the-reading-never-names-the-first-story). A capture measured on a real device
   * found the app's own reading published and ANSWERING, seconds before its poll even started, and
   * still never naming the first story of the boot - a state the old single cause could not tell
   * apart from "nothing published at all", which is why ten rounds of this epic kept aiming fixes at
   * the wrong target. The two are different failures with different next steps: this one asks why
   * MetadataProvider never rendered (or was torn down); `'story-unnamed'` below asks why a reading
   * that DID exist never grew this story's testID.
   */
  | {
      cause: 'nothing-published';
      providerRenderedRelativeToPollMs?: number;
    }
  /**
   * A reading of the app's views WAS published - `collectAppMetadata()` answered with something at
   * some point this poll ran - but it never named this story (see metadataOfTheApp). Carries the
   * same two facts `'nothing-published'` does, for the same reason: whether the reading already
   * existed the moment this poll began, and when MetadataProvider first rendered relative to that
   * moment - both read off the SAME published-but-wrong reading, not off its absence.
   */
  | {
      cause: 'story-unnamed';
      /** Whether `collectAppMetadata()` already answered with something when this poll began. */
      publishedAtPollStart: boolean;
      /**
       * How MetadataProvider's first render in this boot relates to when this poll began: positive
       * is that many ms AFTER the poll started, negative is that many ms BEFORE it, and `undefined`
       * is that the provider had not rendered at all by the time the poll gave up - which can still
       * happen here: a LATER poll check found a reading (of some prior story) that this diagnostic
       * treats as "published", even though THIS poll's own MetadataProvider render never happened.
       */
      providerRenderedRelativeToPollMs?: number;
      /**
       * The distinct testIDs the reading held at the moment this poll gave up - never this story's
       * own, since 'story-unnamed' already means it held no view carrying that one, but whatever
       * OTHER testIDs (if any) its views carried. Empty means the reading held no story's testID at
       * all - a traversal that is not finding a story's views, of any story. One or more means it
       * held a DIFFERENT story's - the app describing a different story than the one this capture
       * asked for, a selection bug wearing a metadata costume. The two are indistinguishable without
       * this, and point at different code (see the file header's note on the race this narrows).
       * Capped at MAX_TEST_IDS_IN_DIAGNOSTICS entries.
       */
      testIdsAtGiveUp: string[];
    }
  /** The story on screen is broken, by the registry Sherlo's own boundary fills. */
  | { cause: 'story-broken'; source: 'error-registry' }
  /**
   * The story on screen is broken, by the fallback words being on screen - and which fiber
   * generation the live-tag check read them off (see theStoryIsBroken's own note on generations).
   */
  | { cause: 'story-broken'; source: 'fallback-text'; generation: 'live' | 'merged' }
  /** Metadata named the story and it was not broken, but the inspector's own tree never grew it. */
  | { cause: 'story-not-in-tree' };

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
      /**
       * What the recorded tree is rooted at - the story's own root, or the app's whole window - how
       * many nodes it holds, and, for a window, WHY (see WindowReason) - absent for a story root,
       * which is never asked why.
       */
      root: { at: 'story' | 'window'; nodeCount: number; reason?: WindowReason };
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

  // Every RunnerBridge.log line from here on is pushed live to the bundler, not carried home
  // inside this capture's own answer (see ./helpers/RunnerBridge/captureLogSink.ts for why). The
  // origin can differ from bundlerCapture()'s own (a real device with no origin to resolve, say),
  // in which case there is nowhere to push to and the sink is simply never registered - the same
  // "nothing to wait on" state bundlerCapture() itself falls back to.
  const origin = bundlerOrigin();
  if (origin) setCaptureLogSink((line) => pushLogLineToBundler(origin, line));

  // The same tracker the test run uses: it buffers the story last rendered, which is what
  // waitForStoryRendered reads after a story is put on screen.
  startStoryRenderedTracking(channel);

  collecting = true;
  collectCaptures({ view, channel, capture: road });
}

/** Stop waiting. The request already in flight is left to finish and its answer dropped. */
export function stopCaptureTransport(): void {
  collecting = false;
  setCaptureLogSink(undefined);
}

/**
 * Push one log line to the bundler's live feed, best-effort. Never awaited by a caller and never
 * throws into the app: a lost line here is no worse than the silence this whole file exists to
 * replace, and RunnerBridge.log must never be slowed down or broken by its own diagnostics.
 */
function pushLogLineToBundler(origin: string, line: string): void {
  fetch(`${origin}${CAPTURE_LOG_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ line }),
  }).catch(() => {
    // Nothing to do with a failed push - see this function's own header.
  });
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
      //
      // THE STORY RIDES ALONG WITH THE RESTART, when the relay had one to send (see the file
      // header). Handing it to openTesting lets the native side land the app on it directly, the
      // same way a run's restart always has a story to hand over as initialSelection - so the app
      // that comes back is not left to boot onto a placeholder and get moved off it afterwards.
      collecting = false;
      SherloModule.openTesting(asked.storyId);
      return;
    }

    if (!asked.storyId) continue;

    answer = await captureTheStory({
      storyId: asked.storyId,
      settings: asked.settings,
      channel,
      view,
    });
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
  view,
}: {
  storyId: string;
  settings: CaptureSettings | undefined;
  channel: StorybookChannel;
  view: StorybookView;
}): Promise<CapturedAnswer> {
  try {
    const onScreen = await waitForTheStoryOnScreen({ storyId, channel, view });
    const settled = await stabilizeTheStory(settings);

    // Asking how many screenfuls the story is puts it back at its top, so it is asked before the
    // tree is read: the tree a capture records is the story as it renders from the beginning.
    //
    // A BROKEN STORY IS NOT MEASURED, because a run does not measure one: the run reads the story's
    // error before it measures anything, so the story it hands over counts as one screenful however
    // tall the view on screen is. Measuring the error view instead would tell the developer their
    // story scrolls when what scrolls is the fallback drawn in its place.
    const parts = theStoryIsBroken(storyId) ? 1 : await screenfulsOfTheStory();
    const recorded = await readTheStory(storyId, onScreen);

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

/** What waiting for the story to actually be on screen hands back to the walk that photographs it. */
type StoryOnScreen = {
  metadata: ReturnType<typeof collectAppMetadata>;
  waited: {
    metadata: WaitOutcome;
    storyViews: WaitOutcome & { rereads: number };
  };
  noMetadataDiagnostics: NoMetadataDiagnostics;
};

/**
 * Put the story on screen and wait until it has rendered, painted, and - load-bearing - until its
 * OWN VIEWS ARE ACTUALLY THERE. `storyRendered` alone is not that: see waitForTheStorysOwnViews for
 * why, and for what happens when they never arrive.
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
  view,
}: {
  storyId: string;
  channel: StorybookChannel;
  view: StorybookView;
}): Promise<StoryOnScreen> {
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

  // THE RACE THE RETRY ABOVE CANNOT WIN. That retry beats Storybook's own default selection (see the
  // file header - it is a safety net, not the only defense), but when THIS story's first channel-
  // driven ask reached Storybook before its own story index had finished loading, no amount of
  // re-asking on a guessed interval helps: the index has to finish loading first, and how long that
  // takes is not this SDK's to guess. So, only once the retry above has given up on this exact story,
  // wait for Storybook to report itself ready - however long that takes, up to its own generous
  // ceiling, resolving immediately if it already is - and ask exactly once more. A story that
  // rendered above never reaches this at all.
  if (!readiness.rendered) {
    const becameReady = await waitUntilStorybookIsReady(view, STORYBOOK_READY_TIMEOUT_MS);
    if (becameReady) {
      channel.emit(SET_CURRENT_STORY, { storyId });
      readiness = await waitForStoryRendered({ storyId, timeoutMs, channel });
    }
  }

  // Close the last-frame gap before the real gate, best-effort: the wait below runs afterwards
  // regardless - the same fallthrough a run itself takes when STORY_RENDERED never came (see
  // awaitStoryReadyAndPaint), so a story that genuinely never rendered still gets the full wait for
  // its own views rather than being left to hang on the paint barrier alone.
  await SherloModule.awaitFrameCommit(
    config.paintBarrierTimeoutMs ?? PAINT_BARRIER_TIMEOUT_MS
  ).catch(() => false);

  return waitForTheStorysOwnViews(storyId, view);
}

/**
 * Whether Storybook itself reports its story index loaded - the same field describeStorybookState
 * reads for its own diagnostic, read directly rather than through a second reading of it.
 *
 * A DELIBERATE COUPLING TO A PRIVATE VENDOR FIELD, NOT AN ACCIDENTAL ONE. `@storybook/react-native`
 * exposes no public "is the index loaded" API - `_ready` is an internal flag on its `View` instance,
 * underscore-prefixed and not part of any documented contract. describeStorybookState already read
 * it for a diagnostic message, where being wrong costs a worse-worded error; waitUntilStorybookIsReady
 * below now reads it to decide WHEN TO ACT, where being wrong costs the fix this file exists for. If a
 * future Storybook version renames or removes this field, `storybookIsReady` reads `undefined`
 * forever, `waitUntilStorybookIsReady` always times out at STORYBOOK_READY_TIMEOUT_MS, and
 * waitForTheStoryOnScreen falls back to exactly its pre-existing behavior (the interval retry above,
 * and no more) - a silent loss of this fix, not a crash, and the diagnostic gate's own message would
 * degrade the same way at the same time, which is the nearest thing to a canary this file has for it.
 */
function storybookIsReady(view: StorybookView): boolean {
  return (view as unknown as { _ready?: unknown })._ready === true;
}

/**
 * Wait for Storybook to report itself ready, or give up after timeoutMs. Polls `_ready` - the exact
 * field storybookIsReady reads - rather than a version-specific promise, so this works the same way
 * the gate's own diagnostic already does, on whatever Storybook version the app carries.
 */
async function waitUntilStorybookIsReady(view: StorybookView, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();

  while (!storybookIsReady(view)) {
    if (Date.now() - startedAt >= timeoutMs) return false;
    await delay(Math.min(STORYBOOK_READY_POLL_INTERVAL_MS, timeoutMs - (Date.now() - startedAt)));
  }

  return true;
}

/**
 * THE REAL GATE, NOT THE PROXY `storyRendered` ABOVE IS. For this adapter, Storybook counts a story
 * "rendered" the instant `renderToCanvas` returns - a synchronous write to Storybook core's own phase
 * bookkeeping, decoupled from React actually COMMITTING the story's views to the native tree. A
 * capture measured on a real device found exactly that gap: `storyRendered` had already fired while
 * the app's native surface still held nothing of the story - two bare views under it, neither one the
 * story's (see the file header's own account of that measurement). So the `storyRendered` wait above
 * is kept as a first, earlier gate, and this is the one this whole task exists to add after it: the
 * SAME check `theStorysOwnTree` already used, further down, to decide whether it was safe to re-root -
 * the app's own reading naming this story, and the native inspector's own tree actually holding the
 * view that reading names - run here, before anything is stabilized or read for the answer, and
 * LOAD-BEARING. A story that never clears it throws, the way a failed inspector walk already does
 * (see theInspectorsOwnAnswer), rather than falling through to record whatever is on screen: a capture
 * that photographs the app's shell and calls it the story is a wrong answer that looks like a right
 * one, and this SDK would rather fail loudly than hand one over.
 *
 * A STORY THAT THREW STILL CLEARS THIS. Storybook's StoryView wraps the story in its testID-carrying
 * View OUTSIDE the error boundary, so a broken story still gets that wrapper committed - which is
 * exactly what theStoryIsBroken/theStorysViewsAreInTheTree already treat as "there" for the same
 * reason downstream (see theStorysOwnTree). This gate asks the same two questions, so a broken story
 * clears it the same way. What a story that clears here goes on to be RECORDED as - re-rooted, or the
 * window because it is broken - is entirely theStorysOwnTree's decision, unchanged by this gate.
 *
 * A FAILURE HERE IS THE MEASUREMENT THIS EPIC HAS NEVER HAD, NOT A BARE TIMEOUT. Eleven rounds of
 * this epic guessed at how long after `storyRendered` the story's views actually arrive; a message
 * that only said "timed out" would still be a guess wearing an error's clothes. So the thrown error
 * carries the two facts a developer (or the next round of this epic) needs to tell "the wait was too
 * short" apart from "something is actually stuck": how long this gate waited, and whether what it
 * was reading ever changed in that time - see describeWhatWasHeld.
 *
 * AND, BECAUSE "THE STORY NEVER ARRIVES" LEAVES SEVERAL DIFFERENT BUGS LOOKING IDENTICAL FROM OUT
 * HERE, WHAT STORYBOOK ITSELF WAS DOING - see describeStorybookState. A capture measured this app
 * alive and answering the whole fifteen seconds, with no story testID anywhere in it - a state that
 * is equally consistent with Storybook's own index never finishing, finishing empty, finishing onto
 * the wrong story, or finishing onto the right one whose render itself failed to bind. Those four are
 * different bugs with different fixes, and only Storybook's own `_ready`/index/selection tell them
 * apart - so the error carries them alongside the wait, rather than leaving the next round to guess.
 */
async function waitForTheStorysOwnViews(
  storyId: string,
  view: StorybookView
): Promise<StoryOnScreen> {
  const {
    metadata,
    wait: metadataWait,
    noMetadataDiagnostics,
    testIdsAtPollStart: metadataTestIdsAtPollStart,
  } = await metadataOfTheApp(storyId);
  const {
    inspectorData,
    wait: storyViewsWait,
    liveTestIdsAtPollStart,
  } = await inspectorDataOfTheApp(storyId, metadata);
  const waited = { metadata: metadataWait, storyViews: storyViewsWait };

  if (
    metadata &&
    (theStoryIsBroken(storyId, inspectorData) ||
      theStorysViewsAreInTheTree(inspectorData, metadata, storyId))
  ) {
    return { metadata, waited, noMetadataDiagnostics };
  }

  if (!metadata) {
    const testIdsAtGiveUp =
      noMetadataDiagnostics.cause === 'story-unnamed' ? noMetadataDiagnostics.testIdsAtGiveUp : [];
    throw new Error(
      `Sherlo: story "${storyId}" never reached the screen - waited ${metadataWait.ms}ms for the ` +
        "app's own reading to name it, then gave up: " +
        `${describeWhatWasHeld(metadataTestIdsAtPollStart, testIdsAtGiveUp)}. ` +
        `${describeStorybookState(view, storyId)}.`
    );
  }

  const testIdsAtGiveUp = testIdsLiveInTheInspector(inspectorData, metadata);
  throw new Error(
    `Sherlo: story "${storyId}" never reached the screen - the app's own reading named it, but its ` +
      `views never appeared in the native view tree: waited ${storyViewsWait.ms}ms across ` +
      `${storyViewsWait.rereads} re-read(s), then gave up: ` +
      `${describeWhatWasHeld(liveTestIdsAtPollStart, testIdsAtGiveUp)}. ` +
      `${describeStorybookState(view, storyId)}.`
  );
}

/**
 * WHAT STORYBOOK ITSELF WAS DOING, read straight off its own `View` instance the way `storiesIn`
 * below already does - never a second reading invented on top of it. Storybook's `StoryView` is the
 * only thing that mounts a view carrying a story's testID, and it renders nothing at all until the
 * index has finished loading (`view._ready`), so a capture that never sees this story's testID
 * cannot yet tell "the index never finished" apart from "it finished onto nothing", "it finished onto
 * the wrong story", or "it finished onto the right one and that story's own render is what failed" -
 * `ready`, how many stories the index holds, and which one Storybook believes is selected split those
 * apart. `selectedStoryId` is left out when Storybook exposes no selection yet, rather than guessed at.
 *
 * AND WHETHER THIS BOOT HAD A STORY HANDED OVER AT ALL. `TestingMode/Storybook.tsx` reads
 * `SherloModule.getLastState()?.nextSnapshot.storyId` into `initialSelection` at construction time -
 * the same field a run's own restart populates, and the one a capture's restart is meant to populate
 * too (`SherloModule.openTesting(storyId)`, native side persists it and rebuilds it into this exact
 * shape - see sherlo#316). Whether that handover actually reached this boot, and with which story, is
 * a fact this file could otherwise only guess at from the outside - so it is read here, once, the same
 * way every other fact in this message is: straight off the source, not inferred.
 */
function describeStorybookState(view: StorybookView, storyId: string): string {
  const asView = view as unknown as {
    _ready?: unknown;
    _storyIndex?: { entries?: Record<string, unknown> };
    _preview?: { currentSelection?: { storyId?: unknown } | null };
  };

  const ready = asView._ready === true;
  const storyCount = Object.keys(asView._storyIndex?.entries ?? {}).length;
  const selectedStoryId = asView._preview?.currentSelection?.storyId;
  const handedOverStoryId = SherloModule.getLastState()?.nextSnapshot.storyId;

  const selection =
    typeof selectedStoryId !== 'string'
      ? 'has selected no story'
      : selectedStoryId === storyId
      ? 'has this story selected'
      : `has selected "${selectedStoryId}" instead`;

  const handover = handedOverStoryId
    ? `the app booted with "${handedOverStoryId}" handed over as its initial selection`
    : 'the app booted with no story handed over as its initial selection';

  return (
    `Storybook itself: ${ready ? 'reports itself ready' : 'never reported itself ready'}, ` +
    `${storyCount} ${storyCount === 1 ? 'story' : 'stories'} in its index, and ${selection} - ` +
    `${handover}`
  );
}

/**
 * "It held only X, unchanged" versus "it started at X and ended at Y" versus "it never held
 * anything" - the one comparison waitForTheStorysOwnViews exists to report, because a bare timeout
 * cannot tell a wait that was simply too short (the reading was still moving when it gave up) apart
 * from a wait that was watching something genuinely stuck (the same reading, unmoving, the whole
 * time). `atStart` and `atGiveUp` are read off the SAME KIND of reading - both the app's published
 * metadata, or both the live native inspector tree - never mixed.
 */
function describeWhatWasHeld(atStart: string[], atGiveUp: string[]): string {
  if (atStart.length === 0 && atGiveUp.length === 0) {
    return 'it never held anything at all the whole time it waited';
  }
  if (sameTestIds(atStart, atGiveUp)) {
    return `it held only ${atGiveUp.join(', ')} the whole time it waited, unchanged`;
  }
  return (
    `it started holding ${atStart.length ? atStart.join(', ') : 'nothing'} and ended holding ` +
    `${atGiveUp.length ? atGiveUp.join(', ') : 'nothing'} - it changed, but never to this story`
  );
}

/** Whether two testID lists name the same set, regardless of order. */
function sameTestIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((id) => bSet.has(id));
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
  root: { at: 'story' | 'window'; nodeCount: number; reason?: WindowReason };
};

/**
 * Read the story off the native inspector - once, fresh, now that stabilizing has run.
 *
 * THE WAITING IS ALREADY DONE. waitForTheStorysOwnViews already polled the app's own reading and the
 * inspector's own tree until both agreed this story was there - load-bearingly, before anything was
 * stabilized - and its outcome is what `onScreen.waited` reports below. What could still have moved
 * since then is the SCREEN ITSELF: stabilizing runs after that gate, so the tree this function reads
 * is read fresh, post-stabilization, rather than reusing the gate's own (pre-stabilization) reading -
 * the same reasoning that always kept this a separate read from the gate's.
 */
async function readTheStory(storyId: string, onScreen: StoryOnScreen): Promise<RecordedStory> {
  const { metadata, waited, noMetadataDiagnostics } = onScreen;
  const inspectorData = await theInspectorsOwnAnswer();

  const { tree, hasNetworkImage, at, reason } = await theStorysOwnTree(
    inspectorData,
    metadata,
    storyId,
    noMetadataDiagnostics
  );

  return {
    tree,
    hasNetworkImage,
    waited,
    root: { at, nodeCount: countNodes(tree), ...(reason && { reason }) },
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
 *
 * `liveTestIdsAtPollStart` IS FOR A FAILURE'S SAKE, NOT A SUCCESS'S. It costs nothing extra to
 * compute - the very first inspector read this function does anyway, read once more through
 * testIdsLiveInTheInspector - and it is what lets waitForTheStorysOwnViews tell "this was moving
 * and simply ran out of ceiling" apart from "this was stuck the whole time" when the wait fails
 * (see describeWhatWasHeld there).
 */
async function inspectorDataOfTheApp(
  storyId: string,
  metadata: ReturnType<typeof collectAppMetadata>
): Promise<{
  inspectorData: InspectorData;
  wait: WaitOutcome & { rereads: number };
  liveTestIdsAtPollStart: string[];
}> {
  const startedAt = Date.now();
  let inspectorData = await theInspectorsOwnAnswer();
  const liveTestIdsAtPollStart = testIdsLiveInTheInspector(inspectorData, metadata);

  // No metadata, or a broken story: theStorysOwnTree never re-roots either case (see there), so
  // there is nothing this wait could usefully poll for - one read is the whole of it.
  if (!metadata || theStoryIsBroken(storyId, inspectorData)) {
    return {
      inspectorData,
      wait: { outcome: 'first-check', ms: Date.now() - startedAt, rereads: 0 },
      liveTestIdsAtPollStart,
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

  return {
    inspectorData,
    wait: { outcome, ms: Date.now() - startedAt, rereads },
    liveTestIdsAtPollStart,
  };
}

/**
 * The distinct testIDs the LIVE native inspector reading currently holds a view for - the same
 * live-tag cross-reference theStoryIsBroken's generation check already makes (liveNativeTags)
 * against the app's own reading of what each tag is (metadata.viewProps), read here as a
 * diagnostic instead of a live-vs-merged decision. "Live" matters the same way it does there: a
 * stale fiber generation's testID must never be reported as something the CURRENT screen holds.
 * `undefined` metadata (nothing published) holds none, the same as testIdsIn. An EMPTY STRING testID
 * is treated the same as no testID at all (see testIdsIn's own note) - it names nothing, so it must
 * never be counted as something the screen holds.
 */
function testIdsLiveInTheInspector(
  inspectorData: InspectorData,
  metadata: ReturnType<typeof collectAppMetadata>
): string[] {
  if (!metadata) return [];
  const live = liveNativeTags(inspectorData.viewHierarchy);
  const ids = new Set<string>();
  for (const [tag, props] of Object.entries(metadata.viewProps)) {
    if (props.testID && live.has(Number(tag))) ids.add(props.testID);
  }
  return Array.from(ids).slice(0, MAX_TEST_IDS_IN_DIAGNOSTICS);
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
  storyId: string,
  noMetadataDiagnostics: NoMetadataDiagnostics
): Promise<{
  tree: CapturedViewTree;
  hasNetworkImage: boolean;
  at: 'story' | 'window';
  reason?: WindowReason;
}> {
  if (!metadata) {
    return {
      tree: captureViewTree(inspectorData.viewHierarchy, componentNamesByNativeTag()),
      hasNetworkImage: false,
      at: 'window',
      reason: noMetadataDiagnostics,
    };
  }

  const broken = brokenStoryReason(storyId, inspectorData);
  if (broken) {
    const reason: WindowReason =
      broken.source === 'error-registry'
        ? { cause: 'story-broken', source: 'error-registry' }
        : { cause: 'story-broken', source: 'fallback-text', generation: broken.generation };
    return {
      tree: captureViewTree(inspectorData.viewHierarchy, componentNamesByNativeTag()),
      hasNetworkImage: false,
      at: 'window',
      reason,
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
    ...(at === 'window' && { reason: { cause: 'story-not-in-tree' } as const }),
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
 *
 * `testIdsAtPollStart` COSTS NOTHING EXTRA, the same reasoning as inspectorDataOfTheApp's own
 * `liveTestIdsAtPollStart`: it is read off the very first `collectAppMetadata()` call this function
 * makes anyway, before the loop even begins. It exists for waitForTheStorysOwnViews to tell a
 * reading that was moving (just never fast enough) apart from one that never moved at all, when
 * this wait fails - see describeWhatWasHeld there.
 */
async function metadataOfTheApp(storyId: string): Promise<{
  metadata: ReturnType<typeof collectAppMetadata>;
  wait: WaitOutcome;
  noMetadataDiagnostics: NoMetadataDiagnostics;
  testIdsAtPollStart: string[];
}> {
  const startedAt = Date.now();
  let metadata = collectAppMetadata();
  const testIdsAtPollStart = testIdsIn(metadata);
  const publishedAtPollStart = metadata !== undefined;
  // Whether ANY check across the WHOLE wait ever saw a reading, not merely the first one - a reading
  // that only appears mid-poll (the provider renders a beat after this poll started, say) still means
  // something published, which is a different failure from nothing ever having (see NoMetadataDiagnostics).
  let everPublished = publishedAtPollStart;
  let checks = 1;

  while (!namesTheStory(metadata, storyId) && Date.now() - startedAt < METADATA_TIMEOUT_MS) {
    await delay(METADATA_POLL_INTERVAL_MS);
    metadata = collectAppMetadata();
    if (metadata !== undefined) everPublished = true;
    checks += 1;
  }

  const named = namesTheStory(metadata, storyId);
  const outcome: WaitOutcome['outcome'] = !named
    ? 'timed-out'
    : checks === 1
    ? 'first-check'
    : 'polled';

  // Read once the poll is over, not merely at its start: the provider can render DURING the poll,
  // and this is the same moment theStorysOwnTree is about to ask whether a no-metadata reason
  // needs recording (see WindowReason and the file header's own reasoning about the race this
  // closes).
  const renderedAt = providerFirstRenderedAt();
  const providerRenderedRelativeToPollMs =
    renderedAt === undefined ? undefined : renderedAt - startedAt;

  const noMetadataDiagnostics: NoMetadataDiagnostics = everPublished
    ? {
        cause: 'story-unnamed',
        publishedAtPollStart,
        providerRenderedRelativeToPollMs,
        // The same `metadata` this poll is about to give up on - not the story-naming one `named`
        // asks about (there is none, that is why this branch is taken), but whatever it actually
        // held at this last check, read for the same reason `renderedAt` was: once the poll is over.
        testIdsAtGiveUp: testIdsIn(metadata),
      }
    : { cause: 'nothing-published', providerRenderedRelativeToPollMs };

  return {
    metadata: named ? metadata : undefined,
    wait: { outcome, ms: Date.now() - startedAt },
    noMetadataDiagnostics,
    testIdsAtPollStart,
  };
}

/**
 * WHICH of the two `no-metadata`-shaped causes theStorysOwnTree is about to record, and the facts
 * behind it - see WindowReason for what `'nothing-published'` and `'story-unnamed'` each mean, and
 * for why they used to be one cause and no longer are. Computed by metadataOfTheApp regardless of
 * how its own poll ended, because whether that poll timed out is exactly what decides whether
 * theStorysOwnTree goes on to use this at all.
 */
type NoMetadataDiagnostics = Extract<
  WindowReason,
  { cause: 'nothing-published' | 'story-unnamed' }
>;

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
 * The distinct testIDs a reading holds, in the order its views carry them, capped at
 * MAX_TEST_IDS_IN_DIAGNOSTICS - what a 'story-unnamed' reason keeps of the reading it gave
 * up on (see WindowReason.testIdsAtGiveUp). `undefined` metadata (no reading at that exact check)
 * holds none - and neither does a view whose testID is the EMPTY STRING: it names nothing, so
 * counting it as a testID the reading "holds" is what used to make describeWhatWasHeld compare a
 * before and an after that print identically but differ by that one invisible entry, printing
 * "it changed" over evidence that had not - and leave a dangling `, ` where the empty id was
 * joined in. `!== undefined` was never enough for that reason; only a real, non-empty id counts.
 */
function testIdsIn(metadata: ReturnType<typeof collectAppMetadata>): string[] {
  if (!metadata) return [];
  const ids = new Set<string>();
  for (const props of Object.values(metadata.viewProps)) {
    if (props.testID) ids.add(props.testID);
  }
  return Array.from(ids).slice(0, MAX_TEST_IDS_IN_DIAGNOSTICS);
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
  return brokenStoryReason(storyId, inspectorData) !== null;
}

/**
 * The same question theStoryIsBroken answers, with WHICH of its two readings answered it - the
 * error registry, or the fallback words and which generation the live-tag check picked them off of
 * (see theStoryIsBroken's own doc for why both readings exist and why the generation matters).
 * `null` when neither reading calls the story broken - theStoryIsBroken's own `false`, with the
 * "which" a plain boolean cannot carry.
 */
function brokenStoryReason(
  storyId: string,
  inspectorData?: InspectorData
):
  | { source: 'error-registry' }
  | { source: 'fallback-text'; generation: 'live' | 'merged' }
  | null {
  if (readStoryError(storyId) !== undefined) return { source: 'error-registry' };

  const metadata = collectAppMetadata();
  if (!metadata) return null;

  if (!inspectorData) {
    return metadata.texts.includes(STORY_ERROR_FALLBACK_TEXT)
      ? { source: 'fallback-text', generation: 'merged' }
      : null;
  }

  const liveTags = liveNativeTags(inspectorData.viewHierarchy);
  const liveGeneration = (metadata.generations ?? [metadata]).find((generation) =>
    Object.entries(generation.viewProps).some(
      ([tag, props]) => props.testID === storyId && liveTags.has(Number(tag))
    )
  );

  const picked = liveGeneration ?? metadata;
  if (!picked.texts.includes(STORY_ERROR_FALLBACK_TEXT)) return null;

  return { source: 'fallback-text', generation: liveGeneration ? 'live' : 'merged' };
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
