/**
 * WHAT `sherlo feedback` PRINTS when the feedback is sent (sherlo / Sending feedback). Its refusals
 * - no text, no saved login, a service it could not reach - print through the entry point like
 * every refusal.
 *
 * Pure, like everything under ./: state in, print-call argument lists out.
 *
 * The screen says what was sent beside the person's words, so nobody has to wonder whether a token
 * or their code left the machine. The words are the content department's.
 */
import chalk from 'chalk';

/** The last Sherlo command this project ran, as the feedback carries it. */
export type LastCommand = { command: string; exitCode: number };

/**
 * The feedback is stored: its reference, then what was sent with it. The last command's line is
 * printed only when this project has a last command recorded.
 */
export function renderFeedbackSent(reference: string, lastCommand?: LastCommand): string[] {
  const lastCommandLines = lastCommand
    ? [
        `${chalk.dim('  ➜')} The last Sherlo command: sherlo ${lastCommand.command}, exit ${lastCommand.exitCode}`,
      ]
    : [];

  return [
    `${chalk.green('✔')}  Feedback sent - thank you! Reference: ${chalk.bold(reference)}`,
    '',
    'Sent with it:',
    ...lastCommandLines,
    `${chalk.dim('  ➜')} The Sherlo, React Native, Expo and Storybook versions`,
    `${chalk.dim('  ➜')} The package manager and the operating system`,
    chalk.dim('No token and no code from your app is ever sent.'),
    '',
  ];
}
