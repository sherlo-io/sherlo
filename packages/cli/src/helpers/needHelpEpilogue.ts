import chalk from 'chalk';
import { CONTACT_EMAIL, DISCORD_URL } from '../constants';

/**
 * The four lines `start.ts` prints after EVERY uncaught command error - a dim
 * rule, "Need Help?", the Discord link, the contact address - in the exact
 * order the live `console.log` calls used to print them.
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
