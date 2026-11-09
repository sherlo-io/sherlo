/**
 * WHAT `sherlo capture` PRINTS ABOUT THE CAPTURE IT KEPT, BESIDE THE STORY OR SCENE.
 *
 * The kept line is dim and comes after the fixed screen of ./capturedStory and ./capturedScene, so
 * those stay byte for byte as their poses pin them. The folder's time is left off it: the folder is
 * named for the time, and a line that carried it would differ on every run.
 */
import chalk from 'chalk';

/** The line saying where the capture was kept. */
export function renderKeptCapture(id: string, picture?: false): string[] {
  if (picture === false) {
    return [
      chalk.dim(
        `No picture was saved. Only the record of the attempt is in .sherlo/captures as ${id}`
      ),
      '',
    ];
  }
  return [chalk.dim(`Kept in .sherlo/captures as ${id}`), ''];
}

/** The one line `sherlo capture --all-scenes` prints when the app declares no scene, so silence never reads as success. */
export function renderNoScenesToCapture(): string[] {
  return [chalk.yellow('No scenes found in this app, so nothing was captured.')];
}
