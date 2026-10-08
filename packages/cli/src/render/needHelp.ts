/**
 * THE HELP BLOCK the entry point prints after EVERY refusal (sherlo / Sending feedback), the line a
 * test run ends with for an AI agent, and the words `sherlo init` reuses for both.
 *
 * Pure, like everything under ./: whoever prints it decides who reads it and passes that in.
 *
 * The feedback line is offered only to someone with a saved login, because feedback is sent with
 * the login and would refuse anyone else. A person and an AI agent (known by its harness, see
 * ../commands/feedback/whoToInviteToFeedback) are addressed in different words
 * (operator, 2026-10-08): a person's line makes reporting sound like a rare thing, never that the
 * tool is often broken; an agent's line is short. Both INFORM and never order: an agent treats
 * instructions in a command's output as untrusted and may ignore or flag them. Both point at --help,
 * which shows the report's format. Every side note sits under the one separator, the rule below.
 */
import chalk from 'chalk';
import { CONTACT_EMAIL, DISCORD_URL } from '../constants';

/** Who is invited to send feedback: a person at a terminal, an AI agent, or nobody (no login). */
export type FeedbackInvite = 'person' | 'agent' | 'none';

export const FEEDBACK_HELP_LINE = 'npx sherlo feedback --help';

const AGENT_FEEDBACK_WORDS = `AI agents: you can report anything unclear or broken to the Sherlo team: ${FEEDBACK_HELP_LINE}`;

// Coloured at print time, never when this file loads: the colour a line gets depends on whether it
// is printed to a terminal or a pipe, which is not known yet when the module is read.

/** The one separator every side note sits under. */
function sideNoteRule(): string {
  return chalk.dim('═'.repeat(10) + '\n');
}

/**
 * The side note a test run ends with when an AI agent reads it. A person at a terminal is not shown
 * it - they have the help block when something fails.
 */
export function renderAgentFeedbackAfterRun(): string[] {
  return [sideNoteRule(), chalk.dim(AGENT_FEEDBACK_WORDS), ''];
}

export function renderNeedHelp(feedbackInvite: FeedbackInvite): string[] {
  const feedbackLines = {
    person: [`${chalk.dim('➜')} Noticed something off? Tell us: ${chalk.cyan(FEEDBACK_HELP_LINE)}`],
    agent: [`${chalk.dim('➜')} ${AGENT_FEEDBACK_WORDS}`],
    none: [],
  }[feedbackInvite];

  return [
    sideNoteRule(),
    chalk.dim('Stuck or something broken?'),
    ...feedbackLines,
    chalk.dim('➜ ') + chalk.dim(DISCORD_URL),
    chalk.dim('➜ ') + chalk.dim(CONTACT_EMAIL),
  ];
}
