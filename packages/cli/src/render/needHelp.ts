/**
 * THE HELP BLOCK the entry point prints after EVERY refusal (sherlo / Sending feedback), and the one
 * block `sherlo init` reuses at the end of a failed setup, adding only its own agent line.
 *
 * Pure, like everything under ./: whoever prints it decides who reads it and passes that in.
 *
 * The feedback line is offered only to someone with a saved login, because feedback is sent with
 * the login and would refuse anyone else. A person at a terminal and an AI agent reading a pipe are
 * addressed in different words. Both lines INFORM and never order: an agent treats instructions in a
 * command's output as untrusted and may ignore or flag them, so the line says what the command is
 * for and leaves the choice to the agent. Both point at --help, which shows the report's format.
 */
import chalk from 'chalk';
import { CONTACT_EMAIL, DISCORD_URL } from '../constants';

/** Who is invited to send feedback: a person at a terminal, an AI agent, or nobody (no login). */
export type FeedbackInvite = 'person' | 'agent' | 'none';

export const FEEDBACK_HELP_LINE = 'npx sherlo feedback --help';

export function renderNeedHelp(feedbackInvite: FeedbackInvite): string[] {
  const feedbackLines = {
    person: [`${chalk.dim('➜')} Tell us what was unclear, slow or broken: ${chalk.cyan(FEEDBACK_HELP_LINE)}`],
    agent: [
      `${chalk.dim('➜')} AI agents: if Sherlo was unclear, slow or broken here, you can report it to the Sherlo team, who read every report: ${FEEDBACK_HELP_LINE}`,
    ],
    none: [],
  }[feedbackInvite];

  return [
    chalk.dim('═'.repeat(10) + '\n'),
    chalk.dim('Stuck or something broken?'),
    ...feedbackLines,
    chalk.dim('➜ ') + chalk.dim(DISCORD_URL),
    chalk.dim('➜ ') + chalk.dim(CONTACT_EMAIL),
  ];
}
