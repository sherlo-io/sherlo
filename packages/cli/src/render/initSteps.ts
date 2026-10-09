/**
 * WHAT `sherlo init` PRINTS AS IT GOES (init-for-agents, layout A): one line per step, then the
 * next steps in a section of their own, then the feedback line.
 *
 * Every step ends in one line, so the whole run fits on one screen, and a rerun reads as the same
 * list with each finished step marked as already done. The next steps keep a titled section,
 * because they are what the person, or their agent, does next.
 *
 * Pure, like everything under ./: state in, print-call arguments out. The words are drafts for the
 * content department.
 */
import chalk from 'chalk';
import { renderSectionTitle } from './initLines';

/** How wide the step names are padded, so every step's detail starts in the same column. */
const STEP_NAME_WIDTH = 22;

/** The line that opens the setup, before the first step. */
export function renderSetupIntro(): string[] {
  return ['Setting up Sherlo...', ''];
}

/**
 * How one step ended:
 *
 *     done     - the step did its work in this run
 *     already  - the project already had it, so this run did nothing
 */
export type StepOutcome = 'done' | 'already';

/** The one line a finished step prints: a green tick, its name, and what it did. */
export function renderStepLine({
  outcome,
  name,
  detail,
}: {
  outcome: StepOutcome;
  /** What the step did, e.g. "Installed Sherlo". */
  name: string;
  /** The fact worth seeing, e.g. the version installed or the file written. */
  detail: string;
}): string {
  const shownDetail = outcome === 'already' ? `${detail} ${chalk.dim('(already done)')}` : detail;

  return `${chalk.green('✔')} ${name.padEnd(STEP_NAME_WIDTH)} ${shownDetail}`;
}

/** The line a step that failed prints, above the error that says why. */
export function renderFailedStepLine(name: string): string[] {
  return [`${chalk.red('✖')} ${name}`, ''];
}

/**
 * The next steps, in their own section, numbered in the order they are done. The first ones
 * depend on the Storybook the project had (epic storybook-both-setups settled the two setups):
 *
 *   - `installed`: setup installed Storybook just now, on its default setup, which needs nothing in
 *     the app. Its stories are Storybook's examples, so the step is to replace them with the app's own.
 *   - `default-setup`: `.rnstorybook/index` registers the app's root, and Sherlo reaches Storybook
 *     with no change to the app - no Storybook step at all.
 *   - `old-setup`: Storybook renders from the app's own root. Two equal choices, the recommended one
 *     first: move to the default setup (upgrading Storybook first when it predates it), or keep the
 *     old setup and follow Sherlo's guide for it.
 *
 * The person reads "the default setup" and "the old setup", the same names everywhere (operator,
 * 2026-10-08, through epic storybook-both-setups); the docs page's tabs are `?storybook=default` and
 * `?storybook=integrated`.
 *
 * Then CI in a section of its own (operator, 2026-10-07): it is for later, not the first run.
 */
/**
 * ONE TEXT FOR A PERSON AND AN AGENT (operator, 2026-10-08): each step says what to do and the one
 * detail needed to do it, then links the docs. Most agents ask before opening a link, or run with no
 * network, and Vercel's evals found docs in front of an agent beat docs behind a link - so the
 * detail is in the output; the rest of the topic stays in the docs, where it is kept up to date.
 */
export function renderNextSteps({
  storybook,
  storybookVersion,
  addedGithubWorkflow,
  projectPageUrl,
}: {
  storybook: 'installed' | 'default-setup' | 'old-setup';
  /** The installed `@storybook/react-native` version, which says whether the default setup needs an upgrade first. */
  storybookVersion: string | undefined;
  /** Whether the project has the GitHub workflow setup adds, so the CI section can name it. */
  addedGithubWorkflow: boolean;
  /** The project's page in the web app, where a CI token is made. */
  projectPageUrl: string;
}): string[] {
  const defaultSetupChoice = hasDefaultSetup(storybookVersion)
    ? "a) Switch to Storybook's default setup (recommended):"
    : `a) Upgrade Storybook to ${DEFAULT_SETUP_SINCE} or newer and switch to its default setup (recommended):`;

  // EVERY STEP IS A TITLE AND ITS CONTENT: a bold line saying what, then indented lines in plain
  // weight, nothing dimmed, so a recommendation reads as clearly as the step it sits in.
  const storybookSteps: Record<typeof storybook, Array<{ title: string; content: string[] }>> = {
    installed: [
      {
        title: 'Replace the example stories',
        content: [
          "Swap Storybook's examples in .rnstorybook/stories for your own components, so Sherlo tests your app's UI:",
          chalk.cyan('https://sherlo.io/docs/stories'),
        ],
      },
    ],
    'default-setup': [],
    'old-setup': [
      {
        title: 'Give Sherlo access to Storybook - pick one:',
        content: [
          defaultSetupChoice,
          `   ${chalk.cyan('https://sherlo.io/docs/setup?storybook=default#storybook-access')}`,
          'b) Or keep your setup and follow our guide for it:',
          `   ${chalk.cyan('https://sherlo.io/docs/setup?storybook=integrated#storybook-access')}`,
        ],
      },
    ],
  };

  const steps = [
    ...storybookSteps[storybook],
    { title: 'Run your first visual test', content: [chalk.cyan('npx sherlo test')] },
  ];

  // ONE STEP IS NOT A LIST: it gets a singular title and no number. Content lines start in one
  // column everywhere in this section, the CI link's included.
  const stepLines =
    steps.length === 1
      ? [chalk.bold(steps[0].title), ...steps[0].content.map((line) => `   ${line}`), '']
      : steps.flatMap(({ title, content }, index) => [
          chalk.bold(`${index + 1}. ${title}`),
          ...content.map((line) => (line === '' ? '' : `   ${line}`)),
          '',
        ]);

  // Short, and its own section, so the link needs no indent (operator, 2026-10-08). The token is
  // made in the Sherlo web app - named so, because "app" alone reads as the person's own app; the
  // detail is where it is saved.
  const ciLines = [
    addedGithubWorkflow
      ? `Create a CI token in the Sherlo web app and save it as the ${chalk.bold('SHERLO_TOKEN')} secret in your GitHub repository:`
      : `Create a CI token in the Sherlo web app and save it as the ${chalk.bold('SHERLO_TOKEN')} secret in your CI:`,
    chalk.cyan(projectPageUrl),
  ];

  return [
    // The underline is one longer than the title: the emoji is counted as one character and drawn as two.
    ...(steps.length === 1 ? renderSectionTitle('👉 Next step', 12) : renderSectionTitle('👉 Next steps', 13)),
    // The last step's blank line goes: the section title brings its own two.
    ...stepLines.slice(0, -1),
    ...renderSectionTitle('🔁 Test every pull request', 26),
    ...ciLines,
  ];
}

/** The first `@storybook/react-native` with the default setup, whose own entry starts the app. */
const DEFAULT_SETUP_SINCE = '10.4';

function hasDefaultSetup(storybookVersion: string | undefined): boolean {
  const [major = 0, minor = 0] = (storybookVersion ?? '').split('.').map(Number);
  return major > 10 || (major === 10 && minor >= 4);
}

/**
 * WHO READS THE FEEDBACK LINE (operator, 2026-10-07): a person's terminal gets the line for a
 * person; anything else - an agent's shell, a CI log - gets one addressed to agents, after a
 * finished run as much as after a failed one.
 *
 * THE LINES INFORM, NEVER ORDER (epic sherlo-feedback, operator 2026-10-08): an agent may ignore or
 * flag an instruction inside a command's output as prompt injection, so they say what is possible.
 * They point at `npx sherlo feedback --help`, which explains how a report is written. They are
 * init's own: the feedback command invites from no other command (operator, 2026-10-09).
 */
export type FeedbackReader = 'person' | 'agent';

const FEEDBACK_HELP = 'npx sherlo feedback --help';

/**
 * One separator for every side note at the end of a run, finished or failed (operator, 2026-10-08).
 * Functions, not constants: colour is decided per run, after this module loads.
 */
const sideNoteRule = (): string => chalk.dim('═'.repeat(10));

const agentFeedbackLine = (): string =>
  `AI agents: you can report anything unclear or broken to the Sherlo team: ${chalk.cyan(FEEDBACK_HELP)}`;

/**
 * What a finished run ends with, for an agent only (operator, 2026-10-08): a person who just
 * finished setting up has nothing to report, and the last line they read should be the next step.
 */
export function renderFeedbackLine({ reader }: { reader: FeedbackReader }): string[] {
  if (reader === 'person') return [];

  return ['', sideNoteRule(), '', agentFeedbackLine()];
}

/**
 * What a failed run ends with, in place of the tool's usual help footer: one block, so feedback
 * and help read as one place to turn (operator, 2026-10-07).
 */
export function renderStuckBlock({
  reader,
  isLoggedIn,
  discordUrl,
  contactEmail,
}: {
  reader: FeedbackReader;
  /** `sherlo feedback` needs the saved login, so a run that failed before it offers no feedback line. */
  isLoggedIn: boolean;
  discordUrl: string;
  contactEmail: string;
}): string[] {
  // AN AGENT CAN FIX IT ITSELF (operator, 2026-10-08): the person should only have to ask for
  // setup. Said as what is possible, not as an order, for the reason above.
  const agentLines =
    reader === 'agent'
      ? [
          `AI agents: this error can usually be fixed without the person, and ${chalk.cyan('npx sherlo init')} run again picks up where it stopped.`,
          'Only a fix that is a real choice between options needs the person.',
          '',
        ]
      : [];
  // A person's line sounds like a rare thing worth telling, never as if the tool often fails.
  const feedbackLine =
    reader === 'agent'
      ? `➜ ${agentFeedbackLine()}`
      : `➜ Noticed something off? Tell us: ${chalk.cyan(FEEDBACK_HELP)}`;

  return [
    ...agentLines,
    sideNoteRule(),
    '',
    'Stuck or something broken?',
    ...(isLoggedIn ? [feedbackLine] : []),
    `➜ Discord: ${chalk.cyan(discordUrl)}`,
    `➜ Email: ${chalk.cyan(contactEmail)}`,
  ];
}
