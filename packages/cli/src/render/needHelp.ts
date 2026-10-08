/**
 * THE HELP BLOCK the entry point prints after EVERY refusal (sherlo / Sending feedback), and the one
 * block `sherlo init` reuses at the end of a failed setup, adding only its own agent line.
 *
 * Pure, like everything under ./: whoever prints it decides who reads it and passes that in.
 *
 * The feedback line is offered only to someone with a saved login, because feedback is sent with
 * the login and would refuse anyone else. A person at a terminal and an AI agent reading a pipe are
 * asked in different words: the agent is told to send it without waiting to be asked.
 */
import chalk from 'chalk';
import { CONTACT_EMAIL, DISCORD_URL } from '../constants';

/** Who is invited to send feedback: a person at a terminal, an AI agent, or nobody (no login). */
export type FeedbackInvite = 'person' | 'agent' | 'none';

export const FEEDBACK_COMMAND_LINE = 'npx sherlo feedback "<your feedback>"';

export function renderNeedHelp(feedbackInvite: FeedbackInvite): string[] {
  const feedbackLines = {
    person: [`${chalk.dim('➜')} Tell us: ${chalk.cyan(FEEDBACK_COMMAND_LINE)}`],
    agent: [
      `${chalk.dim('➜')} AI agent? Share your feedback on what failed with us: ${FEEDBACK_COMMAND_LINE}`,
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
