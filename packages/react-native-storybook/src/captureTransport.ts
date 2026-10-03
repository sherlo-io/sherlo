/**
 * THE APP'S HALF OF THE CAPTURE SOCKET, the open part of it: the road to the bundler, and the words
 * that travel it.
 *
 * The walk itself - waiting for each story to be on screen, stabilizing it and reading its view
 * tree - is the capture driver in the sealed core (packages/sherlo-core/js/src/captureTransport.ts).
 * What stays here is what talks to the developer's bundler: `bundlerCapture`, the one request held
 * open against the address the bundler serves (metro/captureSocket.js), and the shapes of what
 * crosses it, which the command line reads back (packages/cli/src/seams/captureSocket.ts). Every
 * message on this road is shaped here, in the open, beside the middleware it talks to.
 *
 * With no core installed there is no capture: `startCaptureTransport` starts nothing, and
 * `sherlo capture` finds no app waiting.
 */
import { bundlerOrigin } from './bundlerOrigin';
import { getSealedCore } from './sealedCore/loadSealedCore';
import { sherloFetch } from './mocking/network';
import type { StorybookChannel } from './getStorybook/storybookChannel';
import type { StorybookView } from './types';

/** The one address Sherlo adds to the bundler; the other half of it is metro/captureSocket.js. */
const CAPTURE_PATH = '/sherlo/capture';

/**
 * How long the app leaves a request hanging before it gives up on it. Longer than the bundler's own
 * hold, so an unanswered request means the road itself is gone rather than that there was simply no
 * capture to hand over.
 */
const HOLD_TIMEOUT_MS = 25000;

/** What a story threw while rendering, as the app reports it to the bundler. */
export type StoryThrew = { name: string; message: string };

/**
 * How one of the capture's two waits ended: on the very first check, after re-checking one or more
 * times, or by running out its ceiling without ever seeing what it was waiting for.
 *
 * Without it, a capture that waited its whole ceiling and gave up would record the same shape as
 * one that found everything on the first check - `outcome` and `ms` are the difference reaching the
 * terminal, instead of only a tree that happens to be wrong.
 */
export type WaitOutcome = {
  outcome: 'first-check' | 'polled' | 'timed-out';
  /** How long the wait took, start to finish, in ms. */
  ms: number;
};

/**
 * WHY the capture recorded the window rather than the story - the branch the core's driver took,
 * carried out instead of thrown away.
 */
export type WindowReason =
  /**
   * The app never published ANY reading of its views, of any story, at any point the poll ran -
   * nothing rendered this app the way a run renders it. Carries when MetadataProvider - the
   * component that would have published one - first rendered in this boot, relative to when the
   * poll began, because the provider can still have rendered ONCE, earlier in this same boot, and
   * then been withdrawn (unmounted) before the poll ever started - `undefined` is that it never
   * rendered at all.
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
   * some point the poll ran - but it never named this story. Carries the same two facts
   * `'nothing-published'` does, for the same reason: whether the reading already existed the moment
   * the poll began, and when MetadataProvider first rendered relative to that moment - both read off
   * the SAME published-but-wrong reading, not off its absence.
   */
  | {
      cause: 'story-unnamed';
      /** Whether `collectAppMetadata()` already answered with something when the poll began. */
      publishedAtPollStart: boolean;
      /**
       * How MetadataProvider's first render in this boot relates to when the poll began: positive
       * is that many ms AFTER the poll started, negative is that many ms BEFORE it, and `undefined`
       * is that the provider had not rendered at all by the time the poll gave up - which can still
       * happen here: a LATER poll check found a reading (of some prior story) that this diagnostic
       * treats as "published", even though THIS poll's own MetadataProvider render never happened.
       */
      providerRenderedRelativeToPollMs?: number;
      /**
       * The distinct testIDs the reading held at the moment the poll gave up - never this story's
       * own, since 'story-unnamed' already means it held no view carrying that one, but whatever
       * OTHER testIDs (if any) its views carried. Empty means the reading held no story's testID at
       * all - a traversal that is not finding a story's views, of any story. One or more means it
       * held a DIFFERENT story's - the app describing a different story than the one this capture
       * asked for, a selection bug wearing a metadata costume. The two are indistinguishable without
       * this, and point at different code. Capped at a handful of entries.
       */
      testIdsAtGiveUp: string[];
    }
  /** The story on screen is broken, by the registry Sherlo's own boundary fills. */
  | { cause: 'story-broken'; source: 'error-registry' }
  /**
   * The story on screen is broken, by the fallback words being on screen - and which fiber
   * generation the live-tag check read them off.
   */
  | { cause: 'story-broken'; source: 'fallback-text'; generation: 'live' | 'merged' }
  /** Metadata named the story and it was not broken, but the inspector's own tree never grew it. */
  | { cause: 'story-not-in-tree' };

/**
 * One view in the tree a capture records - everything the inspector read for it, plus what the
 * test run's own preparation matched to it.
 *
 * `components` is the names of the app's components that render this view, outermost first. No
 * names means the app did not write this view, or its bundle did not keep the names. `style` and
 * `testID` are absent for the same reason `components` can be empty: no fiber matched this view,
 * either because nothing of the app's rendered it (a native-only view above the story) or the
 * story on screen is broken, in which case a run reads none of this either.
 */
export type CapturedViewTree = {
  primitive: string;
  components: string[];
  visible: boolean;
  /** The view's box in pixels, as the native side measured it. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The same box in points - pixels divided by the device's own density, and rounded. */
  size: { width: number; height: number };
  /** The view's React style, as one object - a style array merged in order, later wins. */
  style?: Record<string, unknown>;
  testID?: string;
  /** What a text view draws - the words among the children prop of the fiber that drew it, and of
   * every nested text span it holds. Absent for a view that draws no words of its own or nested. */
  text?: string;
  /** A `TextInput`'s placeholder, a `Text`'s numberOfLines when it is set, and a view's own
   * accessibilityLabel - nothing else a fiber's props hold. */
  props?: Record<string, string | number>;
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
      /** The device's own density and font scale - a size in pixels means nothing without them. */
      density: number;
      fontScale: number;
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

/**
 * Start waiting on the bundler's capture address: the core's driver walks the captures that arrive
 * on the road. A second call while the first is still collecting is a no-op.
 *
 * `capture` defaults to the bundler this app's JavaScript came from. A built app's JavaScript came
 * from inside the app, so there is no bundler beside it and no address to wait on: nothing starts,
 * and `sherlo capture` is refused by the tool rather than waited on by anybody. With no sealed core
 * nothing starts either.
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
  if (!channel) return;
  const core = getSealedCore();
  if (!core) return;

  const road = capture === undefined ? bundlerCapture() : capture;
  if (!road) return;

  core.startCaptureTransport({ view, channel, capture: road });
}

/** Stop waiting. The request already in flight is left to finish and its answer dropped. */
export function stopCaptureTransport(): void {
  getSealedCore()?.stopCaptureTransport();
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
        const response = await sherloFetch(origin + CAPTURE_PATH, {
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
