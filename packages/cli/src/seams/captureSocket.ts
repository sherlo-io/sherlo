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
      /**
       * How many screenfuls the story was captured in - 1 is a story that fits the screen. Absent
       * when the app said nothing readable about it, which an app older than this field does.
       */
      parts?: number;
      /** Whether any view in the story loads an image over the network. Absent for the same reason. */
      hasNetworkImage?: boolean;
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

/** The one address the SDK adds to the bundler; the bundler's half of it serves this path. */
const CAPTURE_PATH = '/sherlo/capture';

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
      // or the app being closed. Nothing more can be said about it.
      return { kind: 'crashed', storyId };
    }

    return readCaptureAnswer(answer.said, storyId);
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
    tree?: unknown;
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
    return {
      kind: 'captured',
      storyId,
      settled: readSettled(answer.settled),
      ...(threw && { threw }),
      ...(parts !== undefined && { parts }),
      ...(typeof answer.hasNetworkImage === 'boolean' && {
        hasNetworkImage: answer.hasNetworkImage,
      }),
      tree: readCapturedView(answer.tree),
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
 * only the fields that are there kept. A node the app did not name has no component names, and a
 * text view that says nothing has no text.
 */
function readCapturedView(value: unknown): CapturedView {
  const view = value as
    | { primitive?: unknown; components?: unknown; text?: unknown; children?: unknown }
    | null
    | undefined;

  return {
    primitive: typeof view?.primitive === 'string' ? view.primitive : '',
    components: Array.isArray(view?.components)
      ? view.components.filter((name): name is string => typeof name === 'string')
      : [],
    ...(typeof view?.text === 'string' && { text: view.text }),
    children: Array.isArray(view?.children) ? view.children.map(readCapturedView) : [],
  };
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
    children: (view.children ?? []).map(withChildren),
  };
}
