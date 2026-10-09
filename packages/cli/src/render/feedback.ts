/**
 * WHAT `sherlo feedback` PRINTS (sherlo / Sending feedback): the four kinds of report and the
 * sections each needs, which its --help and its refusals share, the dry run, and the screen once it
 * is sent. Its refusals print through the entry point like every refusal.
 *
 * Pure, like everything under ./: state in, print-call argument lists out.
 *
 * WHY KINDS, AND SECTIONS PER KIND. What gets a bug fixed is the steps to reproduce it, and that is
 * what a report leaves out most; so a bug report cannot be sent without them. A missing feature or a
 * misleading doc has no steps, so each kind asks only for what makes ITS report actionable, and
 * "other" asks for nothing but words. "unknown" answers any section, because a guessed step is worse
 * than a missing one. The words are the content department's.
 */
import chalk from 'chalk';
import type { FeedbackContext } from '../seams/serverCalls';

/** A section a report of some kind is written in, with what it holds. */
type Section = { heading: string; holds: string };

/** The four kinds of report, each with what it is for and the sections it cannot be sent without. */
export const FEEDBACK_KINDS = [
  {
    kind: 'bug',
    isFor: 'Something is broken',
    required: [
      { heading: 'Steps', holds: 'The exact commands and edits, in order' },
      { heading: 'Happened', holds: 'What Sherlo did - quote its output' },
      { heading: 'Expected', holds: 'What you expected, and why' },
    ],
    welcome: ['Goal', 'Tried', 'Smallest repro'],
  },
  {
    kind: 'missing',
    isFor: 'A feature, platform or version Sherlo does not support',
    required: [
      { heading: 'Goal', holds: 'What you wanted to do' },
      { heading: 'Missing', holds: 'What Sherlo lacks' },
      { heading: 'Instead', holds: 'What you did instead, or "nothing"' },
    ],
    welcome: [],
  },
  {
    kind: 'unclear',
    isFor: 'A doc page or a message that misled you',
    required: [
      { heading: 'Where', holds: 'The page address, or the message, quoted' },
      { heading: 'Understood', holds: 'What you understood from it' },
      { heading: 'Actually', holds: 'What turned out to be true' },
    ],
    welcome: [],
  },
  { kind: 'other', isFor: 'Anything else, in your own words', required: [] as Section[], welcome: [] as string[] },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]['kind'];

/** Sections sit under their kind's description: `  --kind ` and the widest kind, `unclear`, padded. */
const SECTION_INDENT = ' '.repeat(18);

/** Where every refusal of the command points for the report's format. */
export const FEEDBACK_HELP_LINE = 'npx sherlo feedback --help';

/** The last Sherlo command this project ran, as the feedback carries it. */
export type LastCommand = { command: string; exitCode: number };

/**
 * How to write a report, as --help prints it and a report with no kind or no words is refused with.
 * It leads with the quoted here-document, because the shell changes nothing inside one: unquoted or
 * double-quoted text can end the command at a `;` or run a `$(...)` it quotes.
 */
export function renderFeedbackFormat(): string[] {
  const kindLines = FEEDBACK_KINDS.flatMap(({ kind, isFor, required, welcome }) => {
    const widest = Math.max(0, ...required.map(({ heading }) => heading.length));
    return [
      `  --kind ${kind.padEnd(9)}${isFor}`,
      ...required.map(({ heading, holds }) => `${SECTION_INDENT}## ${heading.padEnd(widest)}  ${holds}`),
      ...(welcome.length > 0 ? [`${SECTION_INDENT}Also welcome: ${welcome.map((heading) => `## ${heading}`).join(', ')}`] : []),
    ];
  });

  return [
    'Say what kind of report it is, and write the sections that kind needs.',
    'Write "unknown" for any you do not know - never guess.',
    '',
    ...kindLines,
    '',
    'Send it in a quoted here-document, so the shell changes nothing in it:',
    "  npx sherlo feedback --kind bug - <<'EOF'",
    '  ## Steps',
    '  ...',
    '  EOF',
    'Or from a file - the way on Windows, which has no here-document:',
    '  npx sherlo feedback --kind bug --file report.md',
    '',
    'Sent with it, so you need not write them: your last Sherlo command with its exit code and error',
    'lines, the Sherlo, React Native, Expo and Storybook versions, the package manager and the OS.',
    'Never write in tokens, passwords, .env contents, personal data, or app code beyond the smallest repro.',
    'Anything shaped like a token or a key is blanked out before it is sent.',
    '`--dry-run` prints exactly what would be sent, and sends nothing. The Sherlo team reads every report.',
  ];
}

const OPERATING_SYSTEM_NAME: Record<string, string> = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows',
};

/** The report and everything sent beside it, exactly as it would leave the machine. Nothing is sent. */
export function renderFeedbackDryRun(kind: FeedbackKind, report: string, context: FeedbackContext): string[] {
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
    `${chalk.yellow('◦')}  Dry run - nothing was sent. This ${kind} report is what would be sent:`,
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
