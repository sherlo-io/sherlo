/**
 * THE LINE OF THE SCENE THAT JUST FINISHED, and what a run of every scene remembers after it
 * (./capturedAllScenes). Pure, like everything under ./.
 */
import type { UnansweredRequest } from '../seams/readAppAnswer';
import { explainRefusals } from './refusalExplanation';
import type { SceneRunLine } from './sceneRunLine';

/** What a run remembers between scenes: the cause the scene before failed for, and whether it has warned of it. */
export type RunMemory = { causeId?: string; warned: boolean };

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
 * The line of the scene that just finished and what the run remembers after it. A scene that fails
 * for the cause of the one before it, with scenes still to run, warns once; with `stopOnRepeat` the
 * warning says the run stops there, and `stopping` is true.
 */
export function lineAfterScene(
  sceneId: string,
  answer: SceneAnswer,
  remaining: number,
  stopOnRepeat: boolean,
  memory: RunMemory
): { line: SceneRunLine; memory: RunMemory; stopping: boolean } {
  const cause =
    answer.kind === 'never-reached' ? explainRefusals(answer.unanswered)?.causes[0] : undefined;
  const repeated = cause !== undefined && cause.id === memory.causeId && remaining > 0;
  const stopping = repeated && stopOnRepeat;
  const sameCause: SceneRunLine['sameCause'] =
    repeated && (stopping || !memory.warned)
      ? {
          remaining,
          cause: cause.short,
          ...(cause.fakes[0] && { fake: cause.fakes[0] }),
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
    memory: { causeId: cause?.id, warned: memory.warned || sameCause !== undefined },
    stopping,
  };
}
