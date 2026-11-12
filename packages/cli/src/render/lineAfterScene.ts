/**
 * THE LINE OF THE SCENE THAT JUST FINISHED, and what a run of every scene remembers after it
 * (./capturedAllScenes). Pure, like everything under ./.
 */
import type { UnansweredRequest } from '../seams/readAppAnswer';
import { streakAfter } from '../seams/sceneCause';
import type { CauseStreak } from '../seams/sceneCause';
import { explainRefusals } from './refusalExplanation';
import type { SceneRunLine } from './sceneRunLine';

/** The answer fields a scene's line reads, whichever ending the answer is. */
type SceneAnswer = {
  kind: string;
  bootMs?: number;
  settled?: { ms?: number };
  reached?: { ms?: number };
  changing?: string[];
  ready?: string;
  unanswered?: UnansweredRequest[];
};

/**
 * The line of the scene that just finished and what the run remembers after it. `cause` is the key
 * the scene did not get ready for (seams/sceneCause), and the run's one memory of it is `streak`:
 * a scene that fails for the cause of the one before it, with scenes still to run, warns once; with
 * `stopOnRepeat` the warning says the run stops there, and `stopping` is true. A refusal names the
 * cause in its own words and brings the fake that answers it.
 */
export function lineAfterScene(
  sceneId: string,
  answer: SceneAnswer,
  cause: string | undefined,
  remaining: number,
  stopOnRepeat: boolean,
  streak: CauseStreak
): { line: SceneRunLine; streak: CauseStreak; stopping: boolean } {
  const next = streakAfter(streak, cause);
  const refusal =
    answer.kind === 'never-reached' ? explainRefusals(answer.unanswered)?.causes[0] : undefined;
  const stopping = next.repeated && remaining > 0 && stopOnRepeat;
  const sameCause: SceneRunLine['sameCause'] =
    cause !== undefined && remaining > 0 && (stopping || next.warn)
      ? {
          remaining,
          cause: refusal?.short ?? cause,
          ...(refusal?.fakes[0] && { fake: refusal.fakes[0] }),
          ...(stopping && { stopped: true as const }),
        }
      : undefined;
  return {
    line: {
      sceneId,
      ending: answer.kind,
      ...(answer.bootMs && { launchMs: answer.bootMs }),
      ...(answer.settled?.ms && { settledMs: answer.settled.ms }),
      ...(answer.reached?.ms !== undefined && { readyMs: answer.reached.ms }),
      ...(answer.changing && { changing: answer.changing }),
      ...(answer.ready !== undefined && { ready: answer.ready }),
      refused: answer.unanswered?.length ?? 0,
      sameCause,
    },
    streak: next.streak,
    stopping,
  };
}
