/**
 * WHAT `sherlo feedback` PRINTS (sherlo / Sending feedback): the report's format, which its --help
 * and its refusals share, the dry run, and the screen once it is sent. Its refusals print through
 * the entry point like every refusal.
 *
 * Pure, like everything under ./: state in, print-call argument lists out.
 *
 * WHY SECTIONS. What gets a bug fixed is the steps to reproduce it, and that is what a report leaves
 * out most; a report in named sections cannot leave a step out silently. "unknown" is a valid answer
 * to any section, because a guessed step is worse than a missing one. The words are the content
 * department's.
 */
import chalk from 'chalk';
import type { FeedbackContext } from '../seams/serverCalls';

/** The six sections every report is written in, each with what it holds. */
export const FEEDBACK_SECTIONS = [
  { heading: 'Goal', holds: 'What you were trying to do, in one sentence' },
  { heading: 'Steps', holds: 'The exact commands and edits, in order' },
  { heading: 'Happened', holds: 'What Sherlo did - quote its output' },
  { heading: 'Expected', holds: 'What you expected, and why' },
  { heading: 'Tried', holds: 'What you changed to get past it, and what each change did' },
  { heading: 'Smallest repro', holds: 'The smallest config or story that shows it' },
] as const;

/** The last Sherlo command this project ran, as the feedback carries it. */
export type LastCommand = { command: string; exitCode: number };

/**
 * How to write a report, as --help prints it and a report with no words is refused with. It says
 * what is attached without asking, and what must never be written in.
 */
export function renderFeedbackFormat(): string[] {
  const widest = Math.max(...FEEDBACK_SECTIONS.map(({ heading }) => heading.length));

  return [
    'Write the report in these six sections. Write "unknown" for any you do not know - never guess.',
    ...FEEDBACK_SECTIONS.map(({ heading, holds }) => `  ## ${heading.padEnd(widest)}  ${holds}`),
    '',
    'Send it as words, a file or piped text:',
    '  npx sherlo feedback --file report.md',
    '  cat report.md | npx sherlo feedback -',
    '',
    'Sent with it, so you need not write them: your last Sherlo command with its exit code and error',
    'lines, the Sherlo, React Native, Expo and Storybook versions, the package manager and the OS.',
    'Never write in tokens, passwords, .env contents, personal data, or app code beyond the smallest repro.',
    '`--dry-run` prints exactly what would be sent, and sends nothing. The Sherlo team reads every report.',
  ];
}

const OPERATING_SYSTEM_NAME: Record<string, string> = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows',
};

/** The report and everything sent beside it, exactly as it would leave the machine. Nothing is sent. */
export function renderFeedbackDryRun(report: string, context: FeedbackContext): string[] {
  const versions = [
    `Sherlo CLI ${context.cliVersion}`,
    context.reactNativeVersion && `React Native ${context.reactNativeVersion}`,
    context.expoVersion && `Expo ${context.expoVersion}`,
    context.storybookVersion &&
      `Storybook ${context.storybookVersion}${context.storybookSetup ? ` (${context.storybookSetup} setup)` : ''}`,
  ].filter(Boolean);

  const lastCommandLines = context.lastCommand
    ? [
        `${chalk.dim('  ➜')} Last command: sherlo ${context.lastCommand.command}, exit ${context.lastCommand.exitCode}`,
        ...context.lastCommand.errorLines.map((line) => chalk.dim(`      ${line}`)),
      ]
    : [];

  return [
    `${chalk.yellow('◦')}  Dry run - nothing was sent. This is what would be sent:`,
    '',
    ...report.split('\n').map((line) => `  ${line}`),
    '',
    'Sent with it:',
    ...lastCommandLines,
    `${chalk.dim('  ➜')} ${versions.join(' · ')}`,
    `${chalk.dim('  ➜')} ${[context.packageManager, OPERATING_SYSTEM_NAME[context.operatingSystem] ?? context.operatingSystem].filter(Boolean).join(' · ')}`,
    '',
  ];
}

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
    chalk.dim('No token is ever sent, and no app code beyond what your report quotes.'),
    '',
  ];
}
