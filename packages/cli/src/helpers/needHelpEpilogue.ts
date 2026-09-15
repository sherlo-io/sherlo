import chalk from 'chalk';
import { CONTACT_EMAIL, DISCORD_URL } from '../constants';

/**
 * The four lines `start.ts` prints after EVERY uncaught command error - a dim
 * rule, "Need Help?", the Discord link, the contact address - in the exact
 * order the live `console.log` calls used to print them.
 *
 * ONE producer of this text: `printNeedHelpEpilogue` prints it (the live
 * path), `renderNeedHelpEpilogue` renders the identical bytes to a string (the
 * `--emit-expectation` path), so a minted fixture can never drift from what a
 * real run prints.
 */
function needHelpEpilogueLines(): string[] {
  return [
    chalk.dim('═'.repeat(10) + '\n'),
    chalk.dim('Need Help?'),
    chalk.dim('➜ ') + chalk.dim(DISCORD_URL),
    chalk.dim('➜ ') + chalk.dim(CONTACT_EMAIL),
  ];
}

export function printNeedHelpEpilogue(): void {
  needHelpEpilogueLines().forEach((line) => console.log(line));
}

/**
 * The exact bytes `printNeedHelpEpilogue` writes to stdout: each line joined
 * by the `\n` a `console.log` call would append, including the final one -
 * so concatenating this after a message printed with a trailing newline
 * reproduces the live terminal byte for byte.
 */
export function renderNeedHelpEpilogue(): string {
  return `${needHelpEpilogueLines().join('\n')}\n`;
}
