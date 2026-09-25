/**
 * THE CAPTURE SOCKET SEAM - the road `sherlo capture` reaches a developer's running app down.
 *
 *     live   - a socket at the bundler's own address, relayed by the bundler between this command
 *              and the SDK inside the running app. The command asks for one story and sends the
 *              stabilization settings; the app restarts into testing mode, walks the same story
 *              path a test run walks, and answers with what it recorded.
 *     posed  - the pose's `capture`: whether a bundler is up, whether an app ever connected, which
 *              stories it has, and what the app answered for the one it was asked to capture.
 *
 * A SEAM OF ITS OWN, NOT THE LETTERBOX. The letterbox remembers one story and hands it to whoever
 * asks; a capture is a conversation - settings one way, a whole view tree the other - and the two
 * roads fail differently.
 */
import type { CapturedView } from '../render/capturedStory';

/**
 * The stabilization settings a capture sends, as the runner sends them today.
 *
 * TWO COPIES OF ONE SET OF NUMBERS, and this is the second. The runner writes the same values into
 * the file it hands the app. They are meant to come from Sherlo's API, read by both, and this copy
 * goes away then; until then a change to the runner's numbers must be made here too.
 *
 * EVERY SETTING THAT DECIDES WHETHER A STORY SETTLED IS HERE, which is why `threshold` and
 * `includeAA` are not optional extras: they decide whether two frames count as the same frame, so a
 * capture that left them to the app's own config would call a story never-settled that a test run
 * would have settled. The app's config holds the SDK's fallback values on an app that has never taken
 * a run, which is exactly the app a developer captures on.
 *
 * `saveScreenshots` is the one runner setting deliberately left out: the runner sets it true, and a
 * capture writes nothing to the device, so the app turns it off itself rather than being told to.
 * There are seven numbers in the runner's file; a capture sends the other six.
 */
export const STABILIZATION_SETTINGS = {
  requiredMatches: 3,
  minScreenshotsCount: 6,
  intervalMs: 500,
  timeoutMs: 20_000,
  threshold: 0.02,
  includeAA: true,
} as const;

/** What the app answered about the story the command asked it to capture. */
export type CaptureResult =
  | { kind: 'no-bundler' }
  | { kind: 'no-app' }
  | { kind: 'no-such-story'; known: string[] }
  | {
      kind: 'crashed';
      storyId: string;
      error?: { name: string; message: string };
      /**
       * Every line the app's own RunnerBridge.log formed since the previous capture (or since it
       * booted, for the first one), drained from the bundler's own live feed - not carried in the
       * app's own answer, which a crash inside the walk can leave never sent at all (see
       * drainCaptureLog and the SDK's captureLogSink.ts). Absent when nothing was logged, or the
       * feed itself is unreachable.
       */
      logs?: string[];
    }
  | {
      kind: 'captured';
      storyId: string;
      /** How the stabilization ended: settled after so long over so many frames, or gave up. */
      settled: { ms: number; frames: number } | 'timed-out';
      threw?: { name: string; message: string };
      /**
       * How many screenfuls the story was captured in - 1 is a story that fits the screen. Absent
       * when the app said nothing readable about it, which an app older than this field does.
       */
      parts?: number;
      /** Whether any view in the story loads an image over the network. Absent for the same reason. */
      hasNetworkImage?: boolean;
      /**
       * The device's own density and font scale - a size in pixels means nothing without them.
       * Absent for the same reason `parts` can be: an app older than these two fields says nothing
       * readable about them.
       */
      density?: number;
      fontScale?: number;
      tree: CapturedView;
      /**
       * How the app's two waits for this story went - for a published reading that names it, and
       * for that story's own views to be in the inspector's tree - and what the tree it recorded is
       * rooted at. Carried across the socket in the app's own answer, never reconstructed here from
       * what came back; absent for the same reason `parts` can be.
       */
      waited?: {
        metadata: WaitOutcome;
        storyViews: WaitOutcome & { rereads: number };
      };
      /** What the tree is rooted at, how many nodes it holds, and, for a window, WHY - see WindowReason. */
      root?: { at: 'story' | 'window'; nodeCount: number; reason?: WindowReason };
      /**
       * Every line the app's own RunnerBridge.log formed since the previous capture (or since it
       * booted, for the first one), drained from the bundler's own live feed - see the `crashed`
       * variant above for why it is drained rather than carried in the answer.
       */
      logs?: string[];
    };

/** How one of the app's waits ended, as it reports it - see the SDK's own WaitOutcome. */
export type WaitOutcome = {
  outcome: 'first-check' | 'polled' | 'timed-out';
  ms: number;
};

/**
 * WHY the app's answer is rooted at the window rather than the story, as it reports it - see the
 * SDK's own WindowReason (packages/react-native-storybook/src/captureTransport.ts).
 */
export type WindowReason =
  /** The app never published any reading of its views, of any story, at any point the poll ran. */
  | {
      cause: 'nothing-published';
      /**
       * How the app's MetadataProvider first rendering relates to when its poll began: positive is
       * that many ms after, negative is that many ms before, `undefined` is that it never rendered
       * at all - or rendered once, earlier in the same boot, and was withdrawn before this poll ran.
       */
      providerRenderedRelativeToPollMs?: number;
    }
  /** A reading WAS published - the app's poll got an answer at some point - but it never named this story. */
  | {
      cause: 'story-unnamed';
      /** Whether the app had published any reading of its views the moment the app's poll began. */
      publishedAtPollStart: boolean;
      /**
       * How the app's MetadataProvider first rendering relates to when its poll began: positive is
       * that many ms after, negative is that many ms before, `undefined` is that it had not
       * rendered at all by the time the poll gave up.
       */
      providerRenderedRelativeToPollMs?: number;
      /**
       * The distinct testIDs the reading held when the app's poll gave up, never this story's own -
       * see the SDK's own WindowReason.testIdsAtGiveUp. Empty means the reading held no story's
       * testID at all; one or more means it held a DIFFERENT story's - two different bugs the record
       * could not otherwise tell apart.
       */
      testIdsAtGiveUp: string[];
    }
  | { cause: 'story-broken'; source: 'error-registry' }
  | { cause: 'story-broken'; source: 'fallback-text'; generation: 'live' | 'merged' }
  | { cause: 'story-not-in-tree' };

/** Everything the tool asks of a running app down this road, and nothing else. */
export type CaptureSocket = {
  captureStory(params: {
    storyId: string;
    port: number;
    settings: typeof STABILIZATION_SETTINGS;
  }): Promise<CaptureResult>;
};

/** The one address the SDK adds to the bundler; the bundler's half of it serves this path. */
const CAPTURE_PATH = '/sherlo/capture';

/**
 * The app's own live log feed, beside the capture address - the other half is the SDK's
 * captureLogSink.ts and metro/captureLogSocket.js. Drained once per capture, after the app's answer
 * is known (or given up on) - see drainCaptureLog.
 */
const CAPTURE_LOG_PATH = '/sherlo/capture-log';

/**
 * How long the command stays on the line for the app to answer. A capture restarts the app and
 * waits for a story to settle, so this is a generous ceiling rather than a second timeout: the app
 * answers the moment it has the tree, and the only real delay is an app that died mid-capture.
 */
const CAPTURE_PATIENCE_MS = 60_000;

/** The shipped answers: a real bundler, with a real app attached to it. */
export const liveCaptureSocket: CaptureSocket = {
  captureStory: async ({ storyId, port, settings }) => {
    const answer = await askTheCaptureSocket({
      port,
      posting: { storyId, settings },
      patienceMs: CAPTURE_PATIENCE_MS,
    });

    if (answer.kind === 'nothing-on-the-port') return { kind: 'no-bundler' };
    if (answer.kind === 'not-in-sherlos-words') return { kind: 'no-app' };

    if (answer.kind === 'gave-up-waiting') {
      // The app was handed the story and then stopped answering - a fatal error, a native crash,
      // or the app being closed. The tree and the settle time are gone with it, but whatever it
      // logged on the way is not: it was already pushed to the bundler's own feed, live, before
      // whatever silenced the app had a chance to (see drainCaptureLog).
      const logs = await drainCaptureLog(port);
      return { kind: 'crashed', storyId, ...(logs.length > 0 && { logs }) };
    }

    const result = readCaptureAnswer(answer.said, storyId);
    if (result.kind === 'captured' || result.kind === 'crashed') {
      const logs = await drainCaptureLog(port);
      if (logs.length > 0) result.logs = logs;
    }
    return result;
  },
};

/**
 * Drain the app's own live log feed - every line pushed since the last drain, which is either this
 * app's boot (nobody has read the feed yet) or this capture's own previous story. Best-effort: an
 * unreachable feed (an app old enough to have never pushed to it, a bundler that went away between
 * the main answer and this read) answers with nothing readable, and that is not this capture's own
 * failure to report - it already has its answer.
 */
async function drainCaptureLog(port: number): Promise<string[]> {
  let response: Response;

  try {
    response = await fetch(`http://localhost:${port}${CAPTURE_LOG_PATH}`);
  } catch (_error) {
    return [];
  }

  if (!response.ok) return [];

  try {
    const said = (await response.json()) as { lines?: unknown };
    return Array.isArray(said.lines) ? said.lines.filter(isString) : [];
  } catch (_error) {
    return [];
  }
}

let installed: CaptureSocket = liveCaptureSocket;

/** The capture socket in force. */
export function captureSocket(): CaptureSocket {
  return installed;
}

/** Install a capture socket for the duration of one posed run; the returned function undoes it. */
export function installCaptureSocket(next: CaptureSocket): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/* ========================================================================== */
/* Talking to the address                                                     */
/* ========================================================================== */

/** What came back from the port. */
type CaptureSocketAnswer =
  /** Nothing accepted a connection. */
  | { kind: 'nothing-on-the-port' }
  /** Something answered, and not in words this tool can read: a bundler nobody routed through
   * Sherlo, or a different server on the port entirely. */
  | { kind: 'not-in-sherlos-words' }
  /** Nothing answered before the tool stopped listening. */
  | { kind: 'gave-up-waiting' }
  /** The relay answered, and here is what it said. */
  | { kind: 'said'; said: unknown };

/**
 * Post one capture to the relay and hold the line until the app answers. The relay keeps the post
 * open across the app's restart into testing mode, so the only waits here are a port with nothing
 * on it and an app that never comes back.
 */
async function askTheCaptureSocket({
  port,
  posting,
  patienceMs,
}: {
  port: number;
  posting: unknown;
  patienceMs: number;
}): Promise<CaptureSocketAnswer> {
  let response: Response;

  try {
    response = await fetch(`http://localhost:${port}${CAPTURE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(posting),
      signal: AbortSignal.timeout(patienceMs),
    });
  } catch (error) {
    if (isNothingOnThePort(error)) return { kind: 'nothing-on-the-port' };
    if ((error as Error | undefined)?.name === 'TimeoutError') return { kind: 'gave-up-waiting' };
    return { kind: 'not-in-sherlos-words' };
  }

  if (!response.ok) return { kind: 'not-in-sherlos-words' };

  try {
    return { kind: 'said', said: await response.json() };
  } catch (_error) {
    return { kind: 'not-in-sherlos-words' };
  }
}

/**
 * `localhost` is two addresses on most machines, so a refusal can arrive as one code or as a list
 * of them - one per address tried. Both shapes mean the same thing: nothing accepted a connection.
 */
function isNothingOnThePort(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown; errors?: { code?: unknown }[] } } | undefined)
    ?.cause;
  const codes = [cause?.code, ...(cause?.errors ?? []).map((one) => one.code)];

  return codes.some((code) => code === 'ECONNREFUSED' || code === 'ENOTFOUND');
}

/**
 * What the relay said about the story it was asked to capture, as this seam's answer.
 *
 * The story id is the one that was POSTED rather than the one that came back, for the same reason
 * the letterbox reads it that way: a caller reads the answer about the id they typed.
 */
function readCaptureAnswer(said: unknown, storyId: string): CaptureResult {
  const answer = said as {
    kind?: unknown;
    known?: unknown;
    settled?: unknown;
    threw?: unknown;
    error?: unknown;
    parts?: unknown;
    hasNetworkImage?: unknown;
    density?: unknown;
    fontScale?: unknown;
    tree?: unknown;
    waited?: unknown;
    root?: unknown;
  };

  if (answer.kind === 'no-app') return { kind: 'no-app' };

  if (answer.kind === 'no-such-story') {
    const known = Array.isArray(answer.known) ? answer.known.filter(isString) : [];
    return { kind: 'no-such-story', known };
  }

  if (answer.kind === 'crashed') {
    const error = readError(answer.error);
    return { kind: 'crashed', storyId, ...(error && { error }) };
  }

  if (answer.kind === 'captured') {
    const threw = readError(answer.threw);
    const parts = readParts(answer.parts);
    const waited = readWaited(answer.waited);
    const root = readRoot(answer.root);
    return {
      kind: 'captured',
      storyId,
      settled: readSettled(answer.settled),
      ...(threw && { threw }),
      ...(parts !== undefined && { parts }),
      ...(typeof answer.hasNetworkImage === 'boolean' && {
        hasNetworkImage: answer.hasNetworkImage,
      }),
      ...(typeof answer.density === 'number' && { density: answer.density }),
      ...(typeof answer.fontScale === 'number' && { fontScale: answer.fontScale }),
      tree: readCapturedView(answer.tree),
      ...(waited && { waited }),
      ...(root && { root }),
    };
  }

  return { kind: 'no-app' };
}

/** How the stabilization ended, or `timed-out` when the relay said nothing readable about it. */
function readSettled(value: unknown): { ms: number; frames: number } | 'timed-out' {
  if (value === 'timed-out') return 'timed-out';
  const settled = value as { ms?: unknown; frames?: unknown } | null | undefined;
  if (typeof settled?.ms === 'number' && typeof settled?.frames === 'number') {
    return { ms: settled.ms, frames: settled.frames };
  }
  return 'timed-out';
}

/**
 * How many screenfuls the app said the story was, or nothing when it said nothing readable about
 * it. Nothing is a real answer - an app older than this field has no such number to give - and the
 * screen says no more for it than it says for a story that fits one screen.
 */
function readParts(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

/**
 * How the app's two waits for this story went, or nothing when it said nothing readable about
 * them - an app older than this field does. Read straight off the wire, never reconstructed: a
 * value read only here and nowhere inferred is the whole point of carrying it across the socket.
 */
function readWaited(
  value: unknown
): { metadata: WaitOutcome; storyViews: WaitOutcome & { rereads: number } } | undefined {
  const waited = value as { metadata?: unknown; storyViews?: unknown } | null | undefined;
  const metadata = readWaitOutcome(waited?.metadata);
  const storyViews = readStoryViewsWait(waited?.storyViews);
  if (!metadata || !storyViews) return undefined;
  return { metadata, storyViews };
}

function readWaitOutcome(value: unknown): WaitOutcome | undefined {
  const outcome = value as { outcome?: unknown; ms?: unknown } | null | undefined;
  if (
    (outcome?.outcome === 'first-check' ||
      outcome?.outcome === 'polled' ||
      outcome?.outcome === 'timed-out') &&
    typeof outcome.ms === 'number'
  ) {
    return { outcome: outcome.outcome, ms: outcome.ms };
  }
  return undefined;
}

function readStoryViewsWait(value: unknown): (WaitOutcome & { rereads: number }) | undefined {
  const outcome = readWaitOutcome(value);
  const rereads = (value as { rereads?: unknown } | null | undefined)?.rereads;
  if (!outcome || typeof rereads !== 'number') return undefined;
  return { ...outcome, rereads };
}

/**
 * What the tree the app recorded is rooted at, and how many nodes it holds - or nothing when the
 * app said nothing readable about it, for the same reason `waited` can be absent.
 */
function readRoot(
  value: unknown
): { at: 'story' | 'window'; nodeCount: number; reason?: WindowReason } | undefined {
  const root = value as { at?: unknown; nodeCount?: unknown; reason?: unknown } | null | undefined;
  if (!(root?.at === 'story' || root?.at === 'window') || typeof root.nodeCount !== 'number') {
    return undefined;
  }
  const reason = readWindowReason(root.reason);
  return { at: root.at, nodeCount: root.nodeCount, ...(reason && { reason }) };
}

/**
 * WHY a window root was reported, read straight off the wire the way `readRoot`'s own fields are -
 * or nothing when the app said nothing readable about it, which an app older than this field does,
 * and which a story root always does (it is never asked why).
 */
function readWindowReason(value: unknown): WindowReason | undefined {
  const reason = value as
    | {
        cause?: unknown;
        source?: unknown;
        generation?: unknown;
        publishedAtPollStart?: unknown;
        providerRenderedRelativeToPollMs?: unknown;
        testIdsAtGiveUp?: unknown;
      }
    | null
    | undefined;

  if (reason?.cause === 'nothing-published') {
    return {
      cause: 'nothing-published',
      ...(typeof reason.providerRenderedRelativeToPollMs === 'number' && {
        providerRenderedRelativeToPollMs: reason.providerRenderedRelativeToPollMs,
      }),
    };
  }
  if (reason?.cause === 'story-unnamed') {
    return {
      cause: 'story-unnamed',
      publishedAtPollStart: reason.publishedAtPollStart === true,
      ...(typeof reason.providerRenderedRelativeToPollMs === 'number' && {
        providerRenderedRelativeToPollMs: reason.providerRenderedRelativeToPollMs,
      }),
      testIdsAtGiveUp: Array.isArray(reason.testIdsAtGiveUp)
        ? reason.testIdsAtGiveUp.filter(isString)
        : [],
    };
  }
  if (reason?.cause === 'story-not-in-tree') return { cause: 'story-not-in-tree' };

  if (reason?.cause === 'story-broken') {
    if (reason.source === 'error-registry') {
      return { cause: 'story-broken', source: 'error-registry' };
    }
    if (
      reason.source === 'fallback-text' &&
      (reason.generation === 'live' || reason.generation === 'merged')
    ) {
      return { cause: 'story-broken', source: 'fallback-text', generation: reason.generation };
    }
  }

  return undefined;
}

/**
 * What the app said its story threw, or what it said crashed, in its own words - or nothing when
 * it said nothing readable. The error's own name and message are the whole of it.
 */
function readError(said: unknown): { name: string; message: string } | undefined {
  const error = said as { name?: unknown; message?: unknown } | null | undefined;
  if (typeof error?.name !== 'string' || typeof error?.message !== 'string') return undefined;
  return { name: error.name, message: error.message };
}

/**
 * One view tree from the wire, read the way the screen needs it: every node's lists filled in, and
 * only the fields that are there kept. A node the app did not name has no component names, a text
 * view that says nothing has no text, and an app older than `size`/`style`/`props` leaves them
 * absent rather than invented.
 *
 * `testID` RIDES INSIDE `props`, THE SAME PLACE `placeholder`, `numberOfLines` AND
 * `accessibilityLabel` DO. The wire carries it as its own field (see CapturedViewTree in the SDK),
 * because it is matched to the view the same way style is, not read off a fiber's props the way
 * the other three are - but the screen draws all four as one set of attributes on the tag, so this
 * is where they are merged into one.
 */
function readCapturedView(value: unknown): CapturedView {
  const view = value as
    | {
        primitive?: unknown;
        components?: unknown;
        text?: unknown;
        size?: unknown;
        style?: unknown;
        testID?: unknown;
        props?: unknown;
        children?: unknown;
      }
    | null
    | undefined;

  const size = readCapturedViewSize(view?.size);
  const style = readCapturedViewStyle(view?.style);
  const props = readCapturedViewProps(view?.testID, view?.props);

  return {
    primitive: typeof view?.primitive === 'string' ? view.primitive : '',
    components: Array.isArray(view?.components)
      ? view.components.filter((name): name is string => typeof name === 'string')
      : [],
    ...(typeof view?.text === 'string' && { text: view.text }),
    ...(size && { size }),
    ...(style && { style }),
    ...(props && { props }),
    children: Array.isArray(view?.children) ? view.children.map(readCapturedView) : [],
  };
}

/** The view's box in points, or nothing when the wire said nothing readable about it. */
function readCapturedViewSize(value: unknown): { width: number; height: number } | undefined {
  const size = value as { width?: unknown; height?: unknown } | null | undefined;
  if (typeof size?.width !== 'number' || typeof size?.height !== 'number') return undefined;
  return { width: size.width, height: size.height };
}

/** The view's merged React style, as the wire already merged it - read through, not re-merged. */
function readCapturedViewStyle(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/**
 * The testID matched to the view, and the placeholder/numberOfLines/accessibilityLabel its own
 * fiber carried.
 */
function readCapturedViewProps(
  testID: unknown,
  props: unknown
): Record<string, string | number | boolean> | undefined {
  const wireProps = props as
    | { placeholder?: unknown; numberOfLines?: unknown; accessibilityLabel?: unknown }
    | null
    | undefined;
  const read: Record<string, string | number | boolean> = {};

  if (typeof testID === 'string') read.testID = testID;
  if (typeof wireProps?.placeholder === 'string') read.placeholder = wireProps.placeholder;
  if (typeof wireProps?.numberOfLines === 'number') read.numberOfLines = wireProps.numberOfLines;
  if (typeof wireProps?.accessibilityLabel === 'string') {
    read.accessibilityLabel = wireProps.accessibilityLabel;
  }

  return Object.keys(read).length > 0 ? read : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/* ========================================================================== */
/* The posed capture socket                                                   */
/* ========================================================================== */

/**
 * The capture socket a pose declares.
 *
 * A pose with no `capture` running `sherlo capture` is refused and RECORDED, the way the letterbox
 * records an unscripted ask: throwing would replace the screen the pose exists to show.
 */
/**
 * What the running app answered for a capture, as a pose states it.
 *
 * As with the letterbox, a pose never supplies the words the screen shows: it states what the app
 * recorded - how the stabilization ended, what the story threw, the view tree - and the tool prints
 * whatever it prints for that.
 */
export type PosedCapture =
  /** No bundler on the address at all. */
  | 'no-bundler'
  /** A bundler is up, and no app carrying the SDK is attached to it. */
  | 'no-app'
  | {
      /** Every story the running app's Storybook knows, by id. */
      stories: string[];
      /**
       * The app stopped answering mid-capture - a fatal error or a native crash - and what it said
       * before it died, when it said anything. An empty object is a crash that said nothing.
       */
      crashed: { name?: string; message?: string };
    }
  | {
      /** Every story the running app's Storybook knows, by id. */
      stories: string[];
      /** How the stabilization ended: settled after so long over so many frames, or gave up. */
      settled: { ms: number; frames: number } | 'timed-out';
      /** What the story threw while rendering, in its own words. Absent for a clean story. */
      threw?: { name: string; message: string };
      /**
       * How many screenfuls the story was captured in. Absent says as little as an app that never
       * mentioned it, which prints the same as `1`: a story that fits the screen.
       */
      parts?: number;
      /** Whether any view in the story loads an image over the network. Absent prints nothing. */
      hasNetworkImage?: boolean;
      /** The view tree the app read, from the story's own root. */
      tree: PosedView;
    };

/**
 * One view in a posed tree. Only what the view has is stated: `components` are the app's own
 * components that render it, outermost first; `text` is what a text view says.
 */
export type PosedView = {
  primitive: string;
  components?: string[];
  text?: string;
  /** The view's box in points, as the inspector reports it. */
  size?: { width: number; height: number };
  /** The React style matched to the view, one object, with the keys the source wrote. */
  style?: Record<string, unknown>;
  /** The other props the screen prints beside the style: a placeholder, a testID, numberOfLines. */
  props?: Record<string, string | number | boolean>;
  children?: PosedView[];
};

export function posedCaptureSocket(
  posed: PosedCapture | undefined
): CaptureSocket & { refusals(): { call: string; problem: string }[] } {
  const refusals: { call: string; problem: string }[] = [];

  return {
    refusals: () => refusals,

    captureStory: async ({ storyId }) => {
      if (!posed) {
        refusals.push({
          call: 'captureStory',
          problem:
            'the pose states no `capture`, and the command asked for one - say what answered',
        });
        return { kind: 'no-bundler' };
      }
      if (posed === 'no-bundler') return { kind: 'no-bundler' };
      if (posed === 'no-app') return { kind: 'no-app' };
      if (!posed.stories.includes(storyId)) return { kind: 'no-such-story', known: posed.stories };

      if ('crashed' in posed) {
        return {
          kind: 'crashed',
          storyId,
          ...(posed.crashed.name &&
            posed.crashed.message && {
              error: { name: posed.crashed.name, message: posed.crashed.message },
            }),
        };
      }

      return {
        kind: 'captured',
        storyId,
        settled: posed.settled,
        ...(posed.threw && { threw: posed.threw }),
        ...(posed.parts !== undefined && { parts: posed.parts }),
        ...(posed.hasNetworkImage !== undefined && { hasNetworkImage: posed.hasNetworkImage }),
        tree: withChildren(posed.tree),
      };
    },
  };
}

/** A posed view states only what it has; the screen needs every node to have its lists. */
function withChildren(view: PosedView): CapturedView {
  return {
    primitive: view.primitive,
    components: view.components ?? [],
    ...(view.text !== undefined && { text: view.text }),
    ...(view.size !== undefined && { size: view.size }),
    ...(view.style !== undefined && { style: view.style }),
    ...(view.props !== undefined && { props: view.props }),
    children: (view.children ?? []).map(withChildren),
  };
}
