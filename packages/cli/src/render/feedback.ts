/**
 * WHAT `sherlo feedback` PRINTS: the four kinds of report and the sections each needs, which its
 * --help and its refusals share, the dry run, and the screen once it is sent. Its refusals print
 * through the entry point like every refusal.
 *
 * Pure, like everything under ./: state in, print-call argument lists out.
 *
 * WHY KINDS, AND SECTIONS PER KIND. What gets a bug fixed is the steps to reproduce it, and that is
 * what a report leaves out most; so a bug report cannot be sent without them. A missing feature or a
 * misleading doc has no steps, so each kind asks only for what makes ITS report actionable, and
 * "other" asks for nothing but words. "unknown" answers any section, because a guessed step is worse
 * than a missing one.
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
      { heading: 'Happened', holds: 'What Sherlo did, quoting its output' },
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
  {
    kind: 'other',
    isFor: 'Anything else, in your own words. No sections are needed.',
    required: [] as Section[],
    welcome: [] as string[],
  },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]['kind'];

/** Sections sit under their kind's description: `  --kind ` and the widest kind, `unclear`, padded. */
const SECTION_INDENT = ' '.repeat(20);

/** Where every refusal of the command points for the report's format. */
export const FEEDBACK_HELP_LINE = 'npx sherlo feedback --help';

/** The last Sherlo command this project ran, as the feedback carries it. */
export type LastCommand = { command: string; exitCode: number };

/**
 * How to write a report, as --help prints it and a report with no kind, or an unknown one, is
 * refused with. A report is read only from a file, a piped one first, because the shell changes
 * nothing inside a quoted here-document, while words after the command may already have run a
 * `$(...)` they quote.
 */
export function renderFeedbackFormat(): string[] {
  const kindLines = FEEDBACK_KINDS.flatMap(({ kind, isFor, required, welcome }) => {
    const widest = Math.max(0, ...required.map(({ heading }) => heading.length));
    return [
      `  --kind ${kind.padEnd(11)}${isFor}`,
      ...required.map(
        ({ heading, holds }) => `${SECTION_INDENT}## ${heading.padEnd(widest)}  ${holds}`
      ),
      ...(welcome.length > 0
        ? [`${SECTION_INDENT}Also welcome: ${welcome.map((heading) => `## ${heading}`).join(', ')}`]
        : []),
    ];
  });

  return [
    'A report says what kind it is, and is sent with the sections that kind needs.',
    'A section is a markdown heading, such as "## Steps", with words under it.',
    '"unknown" is accepted under any heading. A guessed answer is worse for the team than a missing one.',
    '',
    ...kindLines,
    '',
    'The report is read from a file, because the shell may change words typed after the command: inside double quotes it still runs $(...) and backticks, and an unquoted semicolon ends the command. A quoted here-document is left alone by the shell:',
    "  npx sherlo feedback --kind bug --file - <<'EOF'",
    '  ## Steps',
    '  ...',
    '  EOF',
    'On Windows, which has no here-document, a named file works:',
    '  npx sherlo feedback --kind bug --file report.md',
    'A report is 10 to 4,000 characters.',
    '',
    'Sent with the report, without asking: the last Sherlo command this project ran with its exit code and error lines, the Sherlo, React Native, Expo and Storybook versions, the package manager, the operating system, the project and its devices, and the name of the AI agent that ran the command, when there is one.',
    'Never sent: tokens, the saved login, environment values, the rest of the config, an agent session id.',
    'Best left out of the report: tokens, passwords, secret files, personal data, and app code beyond the smallest repro.',
    'Anything shaped like a token or a key is blanked out before it is sent.',
    'With --dry-run the command prints exactly what would be sent, sends nothing and needs no login.',
    'Sending needs a saved login (npx sherlo login). The Sherlo team reads every report.',
  ];
}

const NOT_KNOWN = 'not known';

/** The report and everything sent beside it, exactly as it would leave the machine. Nothing is sent. */
export function renderFeedbackDryRun(
  kind: FeedbackKind,
  report: string,
  context: FeedbackContext
): string[] {
  const { lastCommand } = context;
  const devices = context.devices?.map(({ id }) => id).join(', ');
  const project = context.project
    ? `team ${context.project.teamId}, project number ${context.project.projectIndex}`
    : undefined;
  const lastCommandValue = lastCommand
    ? `npx sherlo ${lastCommand.command}, exit ${lastCommand.exitCode}`
    : 'none recorded';

  return [
    `${chalk.yellow('◦')}  Dry run - nothing was sent. This ${kind} report is what would be sent:`,
    '',
    ...report.split('\n').map((line) => `  ${line}`),
    '',
    'Sent with it, tokens and keys blanked out:',
    `  Project: ${project ?? NOT_KNOWN}`,
    `  Devices: ${devices || NOT_KNOWN}`,
    `  Sherlo SDK: ${context.sdkVersion ?? NOT_KNOWN}`,
    `  Sherlo CLI: ${context.cliVersion}`,
    `  React Native: ${context.reactNativeVersion ?? NOT_KNOWN}`,
    `  Expo: ${context.expoVersion ?? NOT_KNOWN}`,
    `  Storybook: ${context.storybookVersion ?? NOT_KNOWN}`,
    `  Package manager: ${context.packageManager ?? NOT_KNOWN}`,
    `  Operating system: ${context.operatingSystem}`,
    `  AI agent: ${context.agent ?? 'none'}`,
    `  Last command: ${lastCommandValue}`,
    ...(lastCommand?.errorLines ?? []).map((line) => chalk.dim(`      ${line}`)),
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
        `${chalk.dim('  ➜')} The last Sherlo command: npx sherlo ${lastCommand.command}, exit ${
          lastCommand.exitCode
        }`,
      ]
    : [];

  return [
    `${chalk.green('✔')}  Feedback sent - thank you! Reference: ${chalk.bold(reference)}`,
    '',
    'Sent with it:',
    ...lastCommandLines,
    `${chalk.dim('  ➜')} The Sherlo, React Native, Expo and Storybook versions`,
    `${chalk.dim('  ➜')} The package manager and the operating system`,
    `${chalk.dim('  ➜')} The project and its devices`,
    chalk.dim('No token is sent, and no app code beyond what your report quotes.'),
    '',
  ];
}
