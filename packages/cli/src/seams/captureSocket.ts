/**
 * THE CAPTURE SOCKET SEAM - the road `sherlo capture` reaches a developer's running app down.
 *
 *     live   - the bundler's line (`bundlerLine.ts`), relayed by the bundler between this command
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
import { readAppError, type AppError } from './appError';
import { drainAppLog } from './appLog';
import { askTheBundlerLine, type STABILIZATION_SETTINGS } from './bundlerLine';
import { readCapturedView } from './capturedViewReader';
import { captureLiveScene, type SceneCaptureParams, type SceneCaptureResult } from './liveScene';
import { readStrings, readUnanswered, type UnansweredRequest } from './readAppAnswer';

/** What the app answered about the story the command asked it to capture. */
export type CaptureResult =
  | { kind: 'no-bundler' }
  | { kind: 'no-app' }
  | {
      kind: 'no-such-story';
      known: string[];
      /** The story files that threw as the app loaded them, so their stories are missing. Absent when none did. */
      brokenFiles?: BrokenStoryFile[];
    }
  | {
      kind: 'crashed';
      storyId: string;
      error?: AppError;
      /**
       * Every line the app's own RunnerBridge.log formed since the previous capture (or since it
       * booted, for the first one), drained from the bundler's own live feed - not carried in the
       * app's own answer, which a crash inside the walk can leave never sent at all (see
       * drainAppLog and the SDK's captureLogSink.ts). Absent when nothing was logged, or the
       * feed itself is unreachable.
       */
      logs?: string[];
    }
  | {
      kind: 'captured';
      storyId: string;
      /** How the stabilization ended: settled after so long over so many frames, or gave up. */
      settled: { ms: number; frames: number } | 'timed-out';
      /** The views still changing when the stabilization gave up, by the tag the tree draws each by. */
      changing?: string[];
      /** The app's own modules the story reached that no mock replaced, by path. Absent when watching is off. */
      stillReal?: string[];
      /** The requests the story made that no mock answered, in the order it made them. Absent when none were. */
      unanswered?: UnansweredRequest[];
      threw?: AppError;
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

/** A story file that threw as the app loaded it, and what it threw, in its own words. */
export type BrokenStoryFile = { file: string; error: AppError };

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
  /** Boot the app fresh on one scene, run its play, stabilize with the same settings, and read it. */
  captureScene(params: SceneCaptureParams): Promise<SceneCaptureResult>;
};

/**
 * How long the command stays on the line for the app to answer. A capture restarts the app and
 * waits for a story to settle, so this is a generous ceiling rather than a second timeout: the app
 * answers the moment it has the tree, and the only real delay is an app that died mid-capture.
 */
const CAPTURE_PATIENCE_MS = 60_000;

/** The shipped answers: a real bundler, with a real app attached to it. */
export const liveCaptureSocket: CaptureSocket = {
  captureStory: async ({ storyId, port, settings }) => {
    const answer = await askTheBundlerLine({
      port,
      question: { action: 'captureStory', storyId, settings },
      patienceMs: CAPTURE_PATIENCE_MS,
    });

    if (answer.kind === 'nothing-on-the-port') return { kind: 'no-bundler' };
    if (answer.kind === 'not-in-sherlos-words') return { kind: 'no-app' };

    if (answer.kind === 'gave-up-waiting') {
      // The app was handed the story and then stopped answering - a fatal error, a native crash,
      // or the app being closed. The tree and the settle time are gone with it, but whatever it
      // logged on the way is not: it was already pushed to the bundler's own feed, live, before
      // whatever silenced the app had a chance to (see drainAppLog).
      const logs = await drainAppLog(port);
      return { kind: 'crashed', storyId, ...(logs.length > 0 && { logs }) };
    }

    const result = readCaptureAnswer(answer.reply, storyId);
    if (result.kind === 'captured' || result.kind === 'crashed') {
      const logs = await drainAppLog(port);
      if (logs.length > 0) result.logs = logs;
    }
    return result;
  },

  captureScene: captureLiveScene,
};

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

/**
 * What the relay said about the story it was asked to capture, as this seam's answer.
 *
 * The story id is the one that was POSTED rather than the one that came back, for the same reason
 * the letterbox reads it that way: a caller reads the answer about the id they typed.
 */
export function readCaptureAnswer(said: unknown, storyId: string): CaptureResult {
  const answer = said as {
    kind?: unknown;
    known?: unknown;
    brokenFiles?: unknown;
    settled?: unknown;
    changing?: unknown;
    stillReal?: unknown;
    unanswered?: unknown;
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
    const brokenFiles = readBrokenFiles(answer.brokenFiles);
    return { kind: 'no-such-story', known, ...(brokenFiles && { brokenFiles }) };
  }

  if (answer.kind === 'crashed') {
    const error = readAppError(answer.error);
    return { kind: 'crashed', storyId, ...(error && { error }) };
  }

  if (answer.kind === 'captured') {
    const threw = readAppError(answer.threw);
    const parts = readParts(answer.parts);
    const waited = readWaited(answer.waited);
    const root = readRoot(answer.root);
    const changing = readStrings(answer.changing);
    const stillReal = readStrings(answer.stillReal);
    const unanswered = readUnanswered(answer.unanswered);
    return {
      kind: 'captured',
      storyId,
      settled: readSettled(answer.settled),
      ...(changing && { changing }),
      ...(stillReal && { stillReal }),
      ...(unanswered && { unanswered }),
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

/** The files the app said threw as it loaded them, each with its error; a malformed entry is dropped. */
function readBrokenFiles(value: unknown): BrokenStoryFile[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const read: BrokenStoryFile[] = [];
  for (const entry of value) {
    const error = readAppError((entry as { error?: unknown } | null)?.error);
    const file = (entry as { file?: unknown } | null)?.file;
    if (typeof file === 'string' && error) read.push({ file, error });
  }
  return read.length > 0 ? read : undefined;
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
      /** Every story the running app's Storybook knows, by id - the one asked for is not among them. */
      stories: string[];
      /** The story files that threw as the app loaded them, which is why the story asked for is missing. */
      brokenFiles: BrokenStoryFile[];
    }
  | {
      /** Every story the running app's Storybook knows, by id. */
      stories: string[];
      /** How the stabilization ended: settled after so long over so many frames, or gave up. */
      settled: { ms: number; frames: number } | 'timed-out';
      /** The views still changing when the stabilization gave up. Absent prints no names. */
      changing?: string[];
      /** The app's own modules the story reached that no mock replaced. Absent prints no list. */
      stillReal?: string[];
      /** The requests the story made that no mock answered. Absent prints no list. */
      unanswered?: UnansweredRequest[];
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
    }
  /** A scene run: the app's own JS threw while it started, before any scene could be put on it. */
  | {
      /** Every scene id the app's scene files make, in Storybook's id style. */
      scenes: string[];
      threwAtBoot: { name: string; message: string; file: string; line: number };
    }
  /** A scene run: the app booted, and the scene's ready view never showed. */
  | {
      scenes: string[];
      /** The testID of the view the scene waits for. */
      ready: string;
      /** The route the app was on when the wait ran out, outermost screen first. */
      stayedOn: string[];
      /** The requests the scene made that no mock answered, a discover capture's result. */
      unanswered?: UnansweredRequest[];
    }
  /** A scene run: a play step found no view with its testID. */
  | {
      scenes: string[];
      /** The route the app stood on when the step found nothing, outermost screen first. */
      route: string[];
      bootMs: number;
      reachedMs: number;
      /** The steps that ran before the one that found nothing. */
      playDone: PosedPlayStep[];
      /** The step that found nothing, and how long it looked. */
      targetMissing:
        | { tap: string; limitMs: number }
        | { longPress: string; limitMs: number }
        | { type: string; limitMs: number }
        | { swipe: string; direction: 'left' | 'right' | 'up' | 'down'; limitMs: number };
    }
  /** A scene run that came back with its record. */
  | {
      scenes: string[];
      /** The route the app's navigation reached, read from the app, outermost screen first. */
      route: string[];
      /** How long the fresh boot took, and how long from there until the ready view showed. */
      bootMs: number;
      reachedMs: number;
      /** The scene's play steps, all done. */
      play: PosedPlayStep[];
      settled: { ms: number; frames: number };
      /** The requests the scene made that no mock answered, a discover capture's result. */
      unanswered?: UnansweredRequest[];
      tree: PosedView;
    };

/**
 * One step of a scene's `play`: a tap, a long-press, a typing (its name only) or a swipe on a view,
 * or one of the app's own links.
 */
export type PosedPlayStep =
  | { tap: string }
  | { longPress: string }
  | { type: string }
  | { swipe: string; direction: 'left' | 'right' | 'up' | 'down' }
  | { open: string };

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
      if (!('stories' in posed)) {
        refusals.push({
          call: 'captureStory',
          problem:
            'the pose states a scene run, and the command asked for a story - state `stories`',
        });
        return { kind: 'no-bundler' };
      }
      // A CRASH COMES FIRST: an app that died as it started never said which stories it had, so its empty
      // list must not read as a missing story.
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
      if ('brokenFiles' in posed || !posed.stories.includes(storyId)) {
        return {
          kind: 'no-such-story',
          known: posed.stories,
          ...('brokenFiles' in posed && { brokenFiles: posed.brokenFiles }),
        };
      }

      return {
        kind: 'captured',
        storyId,
        settled: posed.settled,
        ...(posed.changing && { changing: posed.changing }),
        ...(posed.stillReal && { stillReal: posed.stillReal }),
        ...(posed.unanswered && { unanswered: posed.unanswered }),
        ...(posed.threw && { threw: posed.threw }),
        ...(posed.parts !== undefined && { parts: posed.parts }),
        ...(posed.hasNetworkImage !== undefined && { hasNetworkImage: posed.hasNetworkImage }),
        tree: withChildren(posed.tree),
      };
    },

    captureScene: async ({ sceneId }) => {
      if (!posed) {
        refusals.push({
          call: 'captureScene',
          problem:
            'the pose states no `capture`, and the command asked for one - say what answered',
        });
        return { kind: 'no-bundler' };
      }
      if (posed === 'no-bundler') return { kind: 'no-bundler' };
      if (posed === 'no-app') return { kind: 'no-app', why: 'never-said-hello' };
      if (!('scenes' in posed)) {
        refusals.push({
          call: 'captureScene',
          problem:
            'the pose states a story run, and the command asked for a scene - state `scenes`',
        });
        return { kind: 'no-bundler' };
      }
      if (!posed.scenes.includes(sceneId)) {
        return { kind: 'no-such-scene', sceneId, known: posed.scenes };
      }
      if ('threwAtBoot' in posed) {
        return { kind: 'crashed-at-boot', sceneId, error: posed.threwAtBoot };
      }
      if ('stayedOn' in posed) {
        const { ready, stayedOn, unanswered } = posed;
        return { kind: 'never-reached', sceneId, ready, stayedOn, unanswered };
      }
      if ('targetMissing' in posed) {
        const { limitMs, ...missing } = posed.targetMissing;
        return {
          kind: 'play-target-missing',
          sceneId,
          route: posed.route,
          done: posed.playDone,
          missing,
          limitMs,
        };
      }
      return {
        kind: 'scene',
        sceneId,
        bootMs: posed.bootMs,
        reached: { route: posed.route, ms: posed.reachedMs },
        play: posed.play,
        settled: posed.settled,
        ...(posed.unanswered && { unanswered: posed.unanswered }),
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
