/**
 * THE LETTERBOX SEAM - the road `sherlo open` and `sherlo inspect` reach a developer's running app
 * down.
 *
 *     live   - the address Sherlo adds to the bundler: post a story there, and the SDK inside the
 *              running app is handed it. NOT BUILT YET - see the debt below.
 *     posed  - the pose's `letterbox`: whether a bundler is up, whether an app ever connected,
 *              which stories that app has, and what it said about the one it was asked for.
 *
 * Every other seam answers a question about THIS machine. This one answers a question about
 * another process on it - a bundler, with an app attached to it - which is why it could not be
 * folded into an existing seam: `serverCalls` is Sherlo's backend, and `workstation` is what the
 * tool does to the machine it runs on.
 *
 * ------------------------------------------------------------------------
 * PLAN-LAYER SEAM, AND THE DEBT IS NAMED HERE ON PURPOSE.
 *
 * The live half of this seam does not exist. It is written as one refusal that names itself, so
 * nothing can mistake it for a road that works: a real `sherlo open` run says the feature is not
 * built rather than hanging on a socket nobody is listening to.
 *
 * It is here at all because the expected report of an epic is drawn by running the SHIPPED tool
 * against a posed world - a screen is evidence about the product, never about whoever posed it -
 * and a command that does not exist prints nothing to review. So the command, its printed screens
 * and this seam's POSED half were written to draw the plan, and the live half is the epic's first
 * task. A reader who finds this comment still here after that task landed has found a bug.
 */
import type { PosedLetterbox } from '../commands/pose/readPose';

/** What the letterbox answered about a story the command asked it to show. */
export type OpenStoryResult =
  /** Nothing is serving on the address: no bundler is running.  */
  | { kind: 'no-bundler' }
  /** A bundler is up, and no app carrying the SDK has connected to it. */
  | { kind: 'no-app' }
  /** The running app's Storybook has no story by that id; these are the ones it has. */
  | { kind: 'no-such-story'; known: string[] }
  /** The app was handed the story, and said whether it reached the screen. */
  | { kind: 'handed-over'; storyId: string; rendered: 'yes' | 'timed-out' | 'not-waited' };

/** What the letterbox answered about the story an app is showing now. */
export type ShowingResult =
  | { kind: 'no-bundler' }
  | { kind: 'no-app' }
  | { kind: 'showing'; storyId: string };

/** Everything the tool asks of a running app, and nothing else. */
export type Letterbox = {
  /** Post one story to the waiting app, waiting for it to reach the screen when asked to. */
  openStory(params: { storyId: string; wait: boolean }): Promise<OpenStoryResult>;
  /** Ask which story the app is showing now. */
  showing(): Promise<ShowingResult>;
};

/** The message both live answers carry, so the debt reads the same wherever it surfaces. */
const NOT_BUILT =
  'the letterbox is not built yet - `sherlo open` and `sherlo inspect` can be posed, not run';

/** The shipped answers, once there are any. Today each one refuses and says why. */
export const liveLetterbox: Letterbox = {
  openStory: async () => {
    throw new Error(NOT_BUILT);
  },
  showing: async () => {
    throw new Error(NOT_BUILT);
  },
};

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
      return {
        kind: 'handed-over',
        storyId,
        rendered: wait ? posed.rendered ?? 'yes' : 'not-waited',
      };
    },

    showing: async () => {
      if (!posed) {
        refuse('showing');
        return { kind: 'no-bundler' };
      }
      if (posed === 'no-bundler') return { kind: 'no-bundler' };
      if (posed === 'no-app') return { kind: 'no-app' };
      // A pose that lists stories but never says which is showing is answering the wrong question,
      // and the first story is a guess this seam may not make.
      if (posed.showing === undefined) {
        refusals.push({
          call: 'showing',
          problem: 'the pose states a `letterbox` with no `showing`, and the command asked what is on screen',
        });
        return { kind: 'no-app' };
      }
      return { kind: 'showing', storyId: posed.showing };
    },
  };
}
