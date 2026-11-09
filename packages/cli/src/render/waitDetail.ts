/**
 * WHAT `sherlo view <n> --wait` ADDS UNDER THE VERDICT: the stories and scenes that ended with no
 * picture, each with its reason, and for a failed run the stage, the device and the cause.
 */
import chalk from 'chalk';

/** One story or scene a finished run ended with no picture for. `reason` is the service's sentence ("never settled"). */
export type NoPicture = { kind: 'story' | 'scene'; name: string; device: string; reason: string };

/** Why a run failed, as the service would name it: the stage, the device, the cause, a reference to quote, and whether it retried. */
export type RunFailure = {
  stage: string;
  device: string;
  cause: string;
  reference: string;
  retried: boolean;
};

/** Every story and scene with no picture, so a green count never hides one. */
export function renderNoPictureList(entries: NoPicture[]): string[] {
  const count = entries.length;
  return [
    chalk.yellow(`! ${count} ${count === 1 ? 'screen ended' : 'screens ended'} with no picture`),
    ...entries.map(
      (entry) =>
        `   ${entry.kind === 'scene' ? 'Scene' : 'Story'} ${entry.name} on ${entry.device}: ${entry.reason}`
    ),
    '',
  ];
}

/** What a failed run adds under its closer, in place of the bare error code. */
export function renderRunFailure(failure: RunFailure): string[] {
  return [
    `It failed at the ${failure.stage} stage on ${failure.device}: ${failure.cause}`,
    failure.retried ? 'Sherlo retried it and it failed again.' : 'Sherlo did not retry it.',
    `If you write to us, quote ${chalk.cyan(failure.reference)}`,
    '',
  ];
}
