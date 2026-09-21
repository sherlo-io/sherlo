/**
 * THE LETTERBOX SEAM - the road `sherlo open` and `sherlo inspect` reach a developer's running app
 * down.
 *
 *     live   - the address Sherlo adds to the bundler: post a story there, and the SDK inside the
 *              running app is handed it. The bundler's half of that address is the SDK's
 *              `metro/openStoryLetterbox.js`, and the app's half its `src/openStoryChannel.ts`.
 *     posed  - the pose's `letterbox`: whether a bundler is up, whether an app ever connected,
 *              which stories that app has, and what it said about the one it was asked for.
 *
 * Every other seam answers a question about THIS machine. This one answers a question about
 * another process on it - a bundler, with an app attached to it - which is why it could not be
 * folded into an existing seam: `serverCalls` is Sherlo's backend, and `workstation` is what the
 * tool does to the machine it runs on.
 */
import type { PosedLetterbox } from '../commands/pose/readPose';

/**
 * What a story threw while rendering, as the app recorded it and the letterbox passed it on. The
 * same two fields the SDK's own `StoryThrew` sends, under the same name, because they are the same
 * fact crossing a wire.
 */
export type StoryThrew = { name: string; message: string };

/** What the letterbox answered about a story the command asked it to show. */
export type OpenStoryResult =
  /** Nothing is serving on the address: no bundler is running.  */
  | { kind: 'no-bundler' }
  /** A bundler is up, and no app carrying the SDK has connected to it. */
  | { kind: 'no-app' }
  /** The running app's Storybook has no story by that id; these are the ones it has. */
  | { kind: 'no-such-story'; known: string[] }
  /**
   * The app was handed the story, and said whether it reached the screen - and, when the story
   * threw while rendering, what it threw. A story only reports its own breakage once it has
   * painted, so `threw` never travels without `rendered: 'yes'`.
   */
  | {
      kind: 'handed-over';
      storyId: string;
      rendered: 'yes' | 'timed-out' | 'not-waited';
      threw?: StoryThrew;
    };

/** What the letterbox answered about the story an app is showing now. */
export type ShowingResult =
  | { kind: 'no-bundler' }
  | { kind: 'no-app' }
  /**
   * An app IS attached to the bundler - it is just not showing a story right now, most often
   * because it is showing itself rather than the story browser. A different fact from `no-app`,
   * and answering `no-app` for it would tell a reader to do something they have already done.
   */
  | { kind: 'not-at-story-browser' }
  | { kind: 'showing'; storyId: string };

/** Everything the tool asks of a running app, and nothing else. */
export type Letterbox = {
  /** Post one story to the waiting app, waiting for it to reach the screen when asked to. */
  openStory(params: {
    storyId: string;
    wait: boolean;
    port: number;
    timeoutSeconds: number;
  }): Promise<OpenStoryResult>;
  /** Ask which story the app is showing now. */
  showing(params: { port: number }): Promise<ShowingResult>;
};

/** The one address the SDK adds to the bundler; the bundler's half of it serves this path. */
const LETTERBOX_PATH = '/sherlo/letterbox';

/**
 * How long the tool waits for an answer that is not a `--wait`. The letterbox answers these at
 * once, so any real delay here is a port that is serving something else entirely.
 */
const REPLY_PATIENCE_MS = 5000;

/**
 * How much longer than the wait it asked for the tool stays on the line. The bundler was told the
 * deadline and answers on it, so this is a grace margin rather than a second timeout.
 */
const PATIENCE_BEYOND_THE_WAIT_MS = 2000;

/** The shipped answers: a real bundler, with a real app attached to it. */
export const liveLetterbox: Letterbox = {
  openStory: async ({ storyId, wait, port, timeoutSeconds }) => {
    const answer = await askTheLetterbox({
      port,
      method: 'POST',
      posting: { storyId, wait, timeoutSeconds },
      patienceMs: wait ? timeoutSeconds * 1000 + PATIENCE_BEYOND_THE_WAIT_MS : REPLY_PATIENCE_MS,
    });

    if (answer.kind === 'nothing-on-the-port') return { kind: 'no-bundler' };
    if (answer.kind === 'not-in-sherlos-words') return { kind: 'no-app' };
    if (answer.kind === 'gave-up-waiting') {
      // Nobody answered in time. On a `--wait` the story was posted before the silence began and
      // the app may still be loading it, which is the same ending as the bundler's own wait
      // running out; without one there is nothing to say the address was ever reached.
      return wait ? { kind: 'handed-over', storyId, rendered: 'timed-out' } : { kind: 'no-app' };
    }

    return readOpenStoryAnswer(answer.said, storyId);
  },

  showing: async ({ port }) => {
    const answer = await askTheLetterbox({
      port,
      method: 'GET',
      patienceMs: REPLY_PATIENCE_MS,
    });

    if (answer.kind === 'nothing-on-the-port') return { kind: 'no-bundler' };
    if (answer.kind !== 'said') return { kind: 'no-app' };

    const said = answer.said as { kind?: unknown; storyId?: unknown };
    if (said.kind === 'showing' && typeof said.storyId === 'string') {
      return { kind: 'showing', storyId: said.storyId };
    }
    if (said.kind === 'not-at-story-browser') return { kind: 'not-at-story-browser' };

    return { kind: 'no-app' };
  },
};

/* ========================================================================== */
/* Talking to the address                                                     */
/* ========================================================================== */

/** What came back from the port. */
type LetterboxAnswer =
  /** Nothing accepted a connection. */
  | { kind: 'nothing-on-the-port' }
  /** Something answered, and not in words this tool can read: a bundler nobody routed through
   * Sherlo, or a different server on the port entirely. */
  | { kind: 'not-in-sherlos-words' }
  /** Nothing answered before the tool stopped listening. */
  | { kind: 'gave-up-waiting' }
  /** The letterbox answered, and here is what it said. */
  | { kind: 'said'; said: unknown };

async function askTheLetterbox({
  port,
  method,
  posting,
  patienceMs,
}: {
  port: number;
  method: 'GET' | 'POST';
  posting?: unknown;
  patienceMs: number;
}): Promise<LetterboxAnswer> {
  let response: Response;

  try {
    response = await fetch(`http://localhost:${port}${LETTERBOX_PATH}`, {
      method,
      ...(posting !== undefined && {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(posting),
      }),
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
 * What the letterbox said about a posted story, as this seam's answer.
 *
 * The story id is the one that was POSTED rather than the one that came back: a caller reads the
 * refusal about the id they typed, and an answer that named a different story would be answering
 * about something nobody asked for.
 */
function readOpenStoryAnswer(said: unknown, storyId: string): OpenStoryResult {
  const answer = said as { kind?: unknown; known?: unknown; rendered?: unknown; threw?: unknown };

  if (answer.kind === 'no-app') return { kind: 'no-app' };

  if (answer.kind === 'no-such-story') {
    const known = Array.isArray(answer.known) ? answer.known.filter(isString) : [];
    return { kind: 'no-such-story', known };
  }

  if (answer.kind === 'handed-over') {
    const rendered =
      answer.rendered === 'yes' ||
      answer.rendered === 'timed-out' ||
      answer.rendered === 'not-waited'
        ? answer.rendered
        : 'not-waited';
    const threw = readThrew(answer.threw);
    return { kind: 'handed-over', storyId, rendered, ...(threw && { threw }) };
  }

  return { kind: 'no-app' };
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * What the app said its story threw, or nothing when it said nothing readable. The error's own
 * name and message are the whole of it: those are the words printed to the developer whose story
 * broke, and a paraphrase of them would be this tool's opinion rather than their story's.
 */
function readThrew(said: unknown): StoryThrew | undefined {
  const threw = said as { name?: unknown; message?: unknown } | undefined;
  if (!isString(threw?.name) || !isString(threw?.message)) return undefined;
  return { name: threw.name, message: threw.message };
}

let installed: Letterbox = liveLetterbox;

/** The letterbox in force. */
export function letterbox(): Letterbox {
  return installed;
}

/** Install a letterbox for the duration of one posed run; the returned function undoes it. */
export function installLetterbox(next: Letterbox): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/* ========================================================================== */
/* The posed letterbox                                                        */
/* ========================================================================== */

/** A question the pose could not answer, and the reason - recorded the way an unscripted call is. */
export type UnansweredAsk = { call: string; problem: string };

/**
 * The letterbox a pose declares.
 *
 * A pose with no `letterbox` running one of these commands is a machine with no bundler on it and
 * no way to say so, which is a pose that forgot a field rather than a state to render. The refusal
 * is RECORDED and the run carries on, the way an unscripted server call is: throwing would replace
 * the screen the pose exists to show with the tool's own error screen.
 */
export function posedLetterbox(
  posed: PosedLetterbox | undefined
): Letterbox & { refusals(): UnansweredAsk[] } {
  const refusals: UnansweredAsk[] = [];

  function refuse(call: string): void {
    refusals.push({
      call,
      problem: 'the pose states no `letterbox`, and the command posted to one - say what answered',
    });
  }

  return {
    refusals: () => refusals,

    openStory: async ({ storyId, wait }) => {
      if (!posed) {
        refuse('openStory');
        return { kind: 'no-bundler' };
      }
      if (posed === 'no-bundler') return { kind: 'no-bundler' };
      if (posed === 'no-app') return { kind: 'no-app' };
      if (!posed.stories.includes(storyId)) {
        return { kind: 'no-such-story', known: posed.stories };
      }
      const rendered = wait ? posed.rendered ?? 'yes' : 'not-waited';
      // A story that never painted has told nobody what it threw, so a pose that states both is
      // answered with the story's silence rather than with a fact the road could not carry.
      const threw = rendered === 'yes' ? posed.threw : undefined;

      return { kind: 'handed-over', storyId, rendered, ...(threw && { threw }) };
    },

    showing: async () => {
      if (!posed) {
        refuse('showing');
        return { kind: 'no-bundler' };
      }
      if (posed === 'no-bundler') return { kind: 'no-bundler' };
      if (posed === 'no-app') return { kind: 'no-app' };
      // A pose with stories but no `showing` is an app that is attached and has nothing on screen
      // to name - not a gap the pose forgot to fill.
      if (posed.showing === undefined) return { kind: 'not-at-story-browser' };
      return { kind: 'showing', storyId: posed.showing };
    },
  };
}
