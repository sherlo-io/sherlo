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
 *
 * PLAN-LAYER ONLY, SAID OUT LOUD. The live road is not built yet: {@link liveCaptureSocket} refuses
 * by name. Only the posed road exists, so the screens can be drawn and judged before anything is
 * built. Building the live road is the epic's own work, not a gap this file hides.
 */
import type { PosedCapture, PosedView } from '../commands/pose/readPose';
import type { CapturedView } from '../render/capturedStory';

/**
 * The stabilization settings a capture sends, as the runner sends them today.
 *
 * TWO COPIES OF ONE SET OF NUMBERS, and this is the second. The runner writes the same values into
 * the file it hands the app. They are meant to come from Sherlo's API, read by both, and this copy
 * goes away then; until then a change to the runner's numbers must be made here too.
 */
export const STABILIZATION_SETTINGS = {
  requiredMatches: 3,
  minScreenshotsCount: 6,
  intervalMs: 500,
  timeoutMs: 20_000,
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
    }
  | {
      kind: 'captured';
      storyId: string;
      /** How the stabilization ended: settled after so long over so many frames, or gave up. */
      settled: { ms: number; frames: number } | 'timed-out';
      threw?: { name: string; message: string };
      tree: CapturedView;
    };

/** Everything the tool asks of a running app down this road, and nothing else. */
export type CaptureSocket = {
  captureStory(params: {
    storyId: string;
    port: number;
    settings: typeof STABILIZATION_SETTINGS;
  }): Promise<CaptureResult>;
};

export const liveCaptureSocket: CaptureSocket = {
  captureStory: async () => {
    throw new Error(
      'sherlo capture is plan-layer only: the socket to the running app is not built yet. ' +
        'Its screens are drawn from poses.'
    );
  },
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

/* ========================================================================== */
/* The posed capture socket                                                   */
/* ========================================================================== */

/**
 * The capture socket a pose declares.
 *
 * A pose with no `capture` running `sherlo capture` is refused and RECORDED, the way the letterbox
 * records an unscripted ask: throwing would replace the screen the pose exists to show.
 */
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
    children: (view.children ?? []).map(withChildren),
  };
}
