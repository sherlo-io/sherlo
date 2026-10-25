/**
 * THE LETTERBOX SEAM - the road `sherlo open` reaches a developer's running app down.
 *
 *     live   - the bundler's line (`bundlerLine.ts`): ask it to show a story, and the SDK inside the
 *              running app is handed it. The bundler's half of the line is the SDK's
 *              `metro/sherloLine.js`, and the app's half is native code.
 *     posed  - the pose's `letterbox`: whether a bundler is up, whether an app ever connected,
 *              which stories that app has, and what it said about the one it was asked for.
 *
 * Every other seam answers a question about THIS machine. This one answers a question about
 * another process on it - a bundler, with an app attached to it - which is why it could not be
 * folded into an existing seam: `serverCalls` is Sherlo's backend, and `workstation` is what the
 * tool does to the machine it runs on.
 */
import type { SceneEnding } from '../render/capturedScene';
import { askTheBundlerLine } from './bundlerLine';
import { STABILIZATION_SETTINGS } from './captureSocket';
import type { NoTarget, SceneTarget } from './deviceState';
import { captureLiveScene } from './liveScene';

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

/** What the letterbox answered about a scene the command asked it to boot fresh on and keep on screen. */
export type OpenSceneResult =
  | { kind: 'no-bundler' }
  | { kind: 'no-app' }
  | { kind: 'no-such-scene'; known: string[] }
  /** The app booted fresh and is on the scene, at this route (outermost screen first). */
  | { kind: 'scene-opened'; sceneId: string; route: string[] }
  /** The app booted and the scene did not come up: the ending a capture of it would print. */
  | Exclude<SceneEnding, { kind: 'no-such-scene' | 'scene' }>;

/** Everything the tool asks of a running app, and nothing else. */
export type Letterbox = {
  /** Boot the app fresh on one scene and leave it there. */
  openScene(params: {
    sceneId: string;
    port: number;
    /** The device and app the scene launches on, or the cause of there being none. */
    target: SceneTarget | NoTarget;
  }): Promise<OpenSceneResult>;
  /** Post one story to the waiting app, waiting for it to reach the screen when asked to. */
  openStory(params: {
    storyId: string;
    wait: boolean;
    port: number;
    timeoutSeconds: number;
  }): Promise<OpenStoryResult>;
};

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
    const answer = await askTheBundlerLine({
      port,
      question: { action: 'openStory', storyId, wait, timeoutSeconds },
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

    return readOpenStoryAnswer(answer.reply, storyId);
  },

  openScene: async ({ sceneId, port, target }) => {
    const answer = await captureLiveScene({
      sceneId,
      port,
      settings: STABILIZATION_SETTINGS,
      target,
    });
    if (answer.kind === 'no-such-scene') return { kind: 'no-such-scene', known: answer.known };
    if (answer.kind === 'scene') {
      return { kind: 'scene-opened', sceneId: answer.sceneId, route: answer.reached.route };
    }
    return answer;
  },
};

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
/**
 * What the letterbox on the bundler answered, as a pose states it.
 *
 * A pose never supplies the words the screen shows. It says which stories the running app has,
 * whether an app was listening at all, and - for a command that waited - what the app reported
 * back about the story it was asked for. The tool prints whatever it prints for that.
 */
export type PosedLetterbox =
  /** No bundler on the address at all: nothing is serving, so there is nowhere to post. */
  | 'no-bundler'
  /** A bundler is up, and no app carrying the SDK has ever connected to its letterbox. */
  | 'no-app'
  | {
      /** Every story the running app's Storybook knows, by id, in the order it lists them. */
      stories: string[];
      /**
       * What the app reported for the story it was asked for: that it is on screen, or that it
       * never got there before the wait ran out. Absent for a post that did not ask to wait.
       */
      rendered?: 'yes' | 'timed-out';
      /**
       * What the story the app was asked for threw while rendering, in the story's own words. A
       * story only reports its own breakage once it has painted, so this is stated alongside
       * `rendered: 'yes'` and nowhere else. Absent poses a story that drew cleanly.
       */
      threw?: { name: string; message: string };
    }
  | {
      /** Every scene id the app's scene files make, in Storybook's id style. */
      scenes: string[];
      /** The route the app is on once it has booted fresh and moved to the scene, outermost first. */
      route: string[];
    };

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
      if (!('stories' in posed)) {
        refuse('openStory');
        return { kind: 'no-bundler' };
      }
      if (!posed.stories.includes(storyId)) {
        return { kind: 'no-such-story', known: posed.stories };
      }
      const rendered = wait ? (posed.rendered ?? 'yes') : 'not-waited';
      // A story that never painted has told nobody what it threw, so a pose that states both is
      // answered with the story's silence rather than with a fact the road could not carry.
      const threw = rendered === 'yes' ? posed.threw : undefined;

      return { kind: 'handed-over', storyId, rendered, ...(threw && { threw }) };
    },

    openScene: async ({ sceneId }) => {
      if (!posed) {
        refuse('openScene');
        return { kind: 'no-bundler' };
      }
      if (posed === 'no-bundler') return { kind: 'no-bundler' };
      if (posed === 'no-app') return { kind: 'no-app' };
      if (!('scenes' in posed)) {
        refuse('openScene');
        return { kind: 'no-bundler' };
      }
      if (!posed.scenes.includes(sceneId)) return { kind: 'no-such-scene', known: posed.scenes };

      return { kind: 'scene-opened', sceneId, route: posed.route };
    },
  };
}
