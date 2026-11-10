/**
 * WHAT `sherlo view <n> --wait` ADDS UNDER THE VERDICT: the stories and scenes that ended with no
 * picture, each with its reason, and for a failed run the stage, the device and the cause.
 */
import chalk from 'chalk';
import type { BuildStatusAnswer } from '../seams/serverCalls';

/** What the wire says of the screens a finished run ended with no picture for; the pose contract pins its shape, so it is named from there, not copied. */
export type NoPicture = NonNullable<BuildStatusAnswer['noPicture']>[number];

/** What the wire says of a failed run; named from the wire for the same reason. */
export type RunFailure = NonNullable<BuildStatusAnswer['runFailure']>;

/** Every story and scene with no picture (pose view-run-result), so a green count never hides one. */
export function renderNoPictureList(entries: NoPicture[]): string[] {
  return [noPictureCountLine(entries.length), ...entries.map(noPictureEntryLine), ''];
}

/** What a failed run adds under its closer, in place of the bare error code (pose view-run-failed). */
export function renderRunFailure(failure: RunFailure): string[] {
  return [failedAtLine(failure), retriedLine(failure), quoteLine(failure), ''];
}

function noPictureCountLine(count: number): string {
  return chalk.yellow(
    `! ${count} ${count === 1 ? 'screen ended' : 'screens ended'} with no picture`
  );
}

function noPictureEntryLine({ kind, name, device, reason }: NoPicture): string {
  return `   ${kind === 'scene' ? 'Scene' : 'Story'} ${name} on ${device}: ${reason}`;
}

function failedAtLine({ stage, device, cause }: RunFailure): string {
  return `It failed at the ${stage} stage on ${device}: ${cause}`;
}

function retriedLine({ retried }: RunFailure): string {
  return retried ? 'Sherlo retried it and it failed again.' : 'Sherlo did not retry it.';
}

function quoteLine({ reference }: RunFailure): string {
  return `If you write to us, quote ${chalk.cyan(reference)}`;
}
