/**
 * WHAT `sherlo capture --logs` PRINTS, BESIDE THE STORY.
 *
 * A separate block from ../render/capturedStory (fixed, its golden poses pin it byte for byte): the
 * app's own log lines are additive evidence a developer opts into, never woven into the screen that
 * command already prints. `--json` carries the same lines unconditionally (see ../seams/captureSocket);
 * this is the one door that puts them on a terminal too.
 */
import chalk from 'chalk';

/** Every line `sherlo capture --logs` prints, in order. */
export function renderCapturedLog(logs: string[]): string[] {
  if (logs.length === 0) {
    return [chalk.dim('The app logged nothing during this capture.'), ''];
  }

  const noun = logs.length === 1 ? 'line' : 'lines';
  return [
    chalk.dim(`The app's own log - ${logs.length} ${noun} recorded during this capture:`),
    ...logs.map((line) => `  ${line}`),
    '',
  ];
}
