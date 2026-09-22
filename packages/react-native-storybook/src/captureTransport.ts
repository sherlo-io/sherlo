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
 * THE SAME STORY PATH A TEST RUN WALKS, READ AGAIN. Put the story on screen through Storybook's own
 * channel, wait for it to render, close the last-frame gap, stabilize, and read the view tree - the
 * same steps the runner drives, told over a socket rather than the runner's file and answered over
 * the same socket rather than the runner's file. That is the whole of the difference.
 *
 * NOTHING IS READ OR WRITTEN IN STORAGE. A test run saves screenshots and writes the protocol file;
 * a capture needs neither, so it stabilizes with saveScreenshots off and never touches a file. The
 * view tree comes straight from the native inspector, over the socket, in memory the whole way.
 *
 * THE TREE NAMES THE APP'S COMPONENTS. Every node reports its native class, and beside it the
 * names of the app's components that render that view, outermost first - so the command prints
 * `SampleLine › Text` where a bare `Text` would leave a developer guessing (./componentNames).
 * The names come from the app's own functions, so a view the app did not write is nameless, and a
 * bundle that dropped the names leaves them absent rather than invented.
 */
import { NativeModules } from 'react-native';
import SherloModule from './SherloModule';
import { InspectorData, InspectorDataNode, StorybookView } from './types';
import { componentNamesByNativeTag, type ComponentNamesByNativeTag } from './componentNames';
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

/** How long a test run lets the paint barrier run before the stability loop proceeds. */
const PAINT_BARRIER_TIMEOUT_MS = 1000;

/** How long a test run keeps asking the inspector for the view tree before it gives up. */
const INSPECTOR_TIMEOUT_MS = 10000;

/** What a story threw while rendering, as the app reports it to the bundler. */
export type StoryThrew = { name: string; message: string };

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
      tree: CapturedViewTree;
    }
  | {
      kind: 'crashed';
      storyId: string;
      error?: StoryThrew;
    };

/**
 * The stabilization numbers a capture is handed, as the runner writes them today. Every one is
 * optional here because the app falls back to its own config when a value is missing.
 */
export type CaptureSettings = {
  requiredMatches?: number;
  minScreenshotsCount?: number;
  intervalMs?: number;
  timeoutMs?: number;
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
    const tree = await readTheViewTree();

    const threw = whatTheStoryThrew(storyId);
    return { kind: 'captured', storyId, settled, ...(threw && { threw }), tree };
  } catch (error) {
    const report = readError(error);
    return { kind: 'crashed', storyId, ...(report && { error: report }) };
  }
}

/** Put the story on screen and wait until it has rendered and painted, as a test run does. */
async function waitForTheStoryOnScreen({
  storyId,
  channel,
}: {
  storyId: string;
  channel: StorybookChannel;
}): Promise<void> {
  const config = SherloModule.getConfig();

  // The story was handed over by name; put it on screen the way Storybook moves between stories,
  // then wait for it to be reported rendered.
  channel.emit(SET_CURRENT_STORY, { storyId });
  await waitForStoryRendered({
    storyId,
    timeoutMs: config.storyRenderedTimeoutMs ?? STORY_RENDERED_TIMEOUT_MS,
    channel,
  });

  // Close the last-frame gap before stabilizing, best-effort: the stability loop runs afterwards
  // regardless.
  await SherloModule.awaitFrameCommit(
    config.paintBarrierTimeoutMs ?? PAINT_BARRIER_TIMEOUT_MS
  ).catch(() => false);
}

/**
 * Run the stability loop the way a test run does, and say how it ended. A capture saves no
 * screenshots, so saveScreenshots is off and nothing is written to the device.
 */
async function stabilizeTheStory(
  settings: CaptureSettings | undefined
): Promise<{ ms: number; frames: number } | 'timed-out'> {
  const config = SherloModule.getConfig();
  const stabilization = config.stabilization;

  const frames = settings?.minScreenshotsCount ?? stabilization.minScreenshotsCount;

  const startedAt = Date.now();
  const isStable = await SherloModule.stabilize(
    settings?.requiredMatches ?? stabilization.requiredMatches,
    settings?.minScreenshotsCount ?? stabilization.minScreenshotsCount,
    settings?.intervalMs ?? stabilization.intervalMs,
    settings?.timeoutMs ?? stabilization.timeoutMs,
    false, // a capture records a tree, not screenshots
    stabilization.threshold,
    stabilization.includeAA
  );

  return isStable ? { ms: Date.now() - startedAt, frames } : 'timed-out';
}

/** Read the view tree straight from the native inspector, retrying the way a test run does. */
async function readTheViewTree(): Promise<CapturedViewTree> {
  let inspectorData: InspectorData | undefined;
  const startedAt = Date.now();

  while (!inspectorData) {
    if (Date.now() - startedAt > INSPECTOR_TIMEOUT_MS) {
      throw new Error('getInspectorData timed out after 10s');
    }
    inspectorData = await SherloModule.getInspectorData().catch(() => undefined);
  }

  return captureViewTree(inspectorData.viewHierarchy, componentNamesByNativeTag());
}

/**
 * One view tree as the command prints it: the native class of every node, and the app's component
 * names above it. The names are read from the fibers the story was rendered from, keyed by the
 * same native tag the inspector reports for the view, so a view the app did not render is simply
 * absent from that reading and comes out nameless.
 */
function captureViewTree(
  node: InspectorDataNode,
  names: ComponentNamesByNativeTag
): CapturedViewTree {
  return {
    primitive: node.className,
    components: names.get(node.id) ?? [],
    children: (node.children ?? []).map((child) => captureViewTree(child, names)),
  };
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
