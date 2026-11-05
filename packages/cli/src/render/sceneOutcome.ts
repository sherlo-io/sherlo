/**
 * HOW A SCENE ENDED, in the four words the all-scenes run counts by (./capturedAllScenes). Pure,
 * like everything under ./.
 */

/** How a scene ended, in the four words the summary counts by. */
export type SceneOutcome = 'captured' | 'never-settled' | 'never-reached' | 'failed';

/** The outcome an app's answer counts as: a scene came up and held still, came up and kept moving, never came up, or failed. */
export function outcomeOf(kind: string): SceneOutcome {
  if (kind === 'scene') return 'captured';
  if (kind === 'never-settled') return 'never-settled';
  if (kind === 'never-reached') return 'never-reached';
  return 'failed';
}
