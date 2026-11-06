/**
 * WHY A SCENE DID NOT GET READY, as one key two scenes can be compared by: a run of every scene
 * warns when three in a row end with the same key. Pure, like the readers beside it.
 *
 * The key is the first of these the record has: what covered the app, the first line of the error
 * the app threw, the play step that found no view, and last the route the ready view never showed
 * on. Logged errors and warnings are not a cause: they sit in scenes that came up too.
 */
import type { PlayMissing } from '../render/capturedScene';
import type { SceneStop } from '../render/sceneStop';

/** The fields of a scene's record the key reads, whichever ending the record is. */
export type CauseSource = {
  kind: string;
  stop?: SceneStop;
  /** The permission whose system dialog covered the app, when one did. */
  permission?: string;
  threw?: { message: string };
  error?: { message: string };
  missing?: PlayMissing;
  route?: string[];
  stayedOn?: string[];
};

/** The endings that say a scene did not get ready; every other ending has no cause to repeat. */
const NOT_READY_ENDINGS = [
  'never-reached',
  'play-target-missing',
  'crashed-mid-capture',
  'crashed-at-boot',
];

/** The key of the cause a scene did not get ready for; nothing for a scene that came up or ended another way. */
export function sceneCauseOf(source: CauseSource): string | undefined {
  if (!NOT_READY_ENDINGS.includes(source.kind)) return undefined;

  if (source.stop?.kind === 'covered') {
    return source.permission
      ? `covered by the ${source.permission} permission dialog`
      : `covered by a ${source.stop.early.stuckOn} screen`;
  }

  const firstErrorLine = (source.threw ?? source.error)?.message.split('\n')[0].trim();
  if (firstErrorLine) return firstErrorLine;

  if (source.missing) return `${stepName(source.missing)} found no view`;

  return `ready view never showed on ${(source.stayedOn ?? source.route ?? []).join(' › ')}`;
}

/** A play step by what it does and to which view. */
function stepName(step: PlayMissing): string {
  if ('tap' in step) return `tap ${step.tap}`;
  if ('longPress' in step) return `long-press ${step.longPress}`;
  if ('type' in step) return `type into ${step.type}`;
  return `swipe ${step.direction} on ${step.swipe}`;
}

/** How many scenes in a row ending with one cause make a run warn, or stop with `--stop-on-repeat`. */
export const REPEAT_LIMIT = 3;

/** What a run of every scene remembers of the causes so far: the last one, how long it has run, whether it warned. */
export type CauseStreak = { cause?: string; count: number; warned: boolean };

/**
 * The streak after one more scene, and whether that scene is the one to warn (once per run) or the
 * run is on a repeat. A scene with no cause, or another cause, starts the count again.
 */
export function streakAfter(
  streak: CauseStreak,
  cause: string | undefined
): { streak: CauseStreak; repeated: boolean; warn: boolean } {
  const count = cause === undefined ? 0 : cause === streak.cause ? streak.count + 1 : 1;
  const repeated = count >= REPEAT_LIMIT;
  const warn = repeated && !streak.warned;
  return { streak: { cause, count, warned: streak.warned || warn }, repeated, warn };
}
