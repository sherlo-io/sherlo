/**
 * WHAT `sherlo capture --all-scenes` PRINTS at its end: one closing summary. The line each scene
 * prints as it finishes is ./sceneRunLine, and ./lineAfterScene makes it.
 *
 * Pure, like everything under ./: state in, lines out. The picture and the record of every scene
 * are kept in .sherlo/captures (./keptCapture), never on the screen: the screen says only how each
 * scene ended.
 */
import chalk from 'chalk';

/** The count of each outcome over the scenes a run ran, and where the pictures and records went. */
export type AllScenesSummary = {
  folder: string;
  captured: number;
  neverSettled: number;
  neverReached: number;
  failed: number;
};

/** The closing lines: how many scenes ended each way, and where the pictures and records are. */
export function renderAllScenesSummary(summary: AllScenesSummary): string[] {
  const { captured, neverSettled, neverReached, failed, folder } = summary;
  const total = captured + neverSettled + neverReached + failed;
  return [
    '',
    `${total} ${total === 1 ? 'scene' : 'scenes'}: ${captured} captured, ${neverSettled} never settled, ${neverReached} never reached, ${failed} failed`,
    chalk.dim(
      `   a picture (not for a scene that never came up) and a record of each are kept in ${folder}`
    ),
    '',
  ];
}
