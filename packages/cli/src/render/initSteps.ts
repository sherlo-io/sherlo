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
 *   - `installed`: setup installed Storybook just now, on its newer setup, which needs nothing in the
 *     app. Its stories are Storybook's examples, so the step is to replace them with the app's own.
 *   - `newer-setup`: `.rnstorybook/index` registers the app's root, and Sherlo reaches Storybook
 *     with no change to the app - no Storybook step at all.
 *   - `older-setup`: Storybook renders from the app's own root. Two equal choices, the recommended
 *     one first: move to the newer setup (upgrading Storybook first when it predates it), or keep
 *     the setup and follow Sherlo's guide for it.
 *
 * Then CI in a section of its own (operator, 2026-10-07): it is for later, not the first run.
 */
export function renderNextSteps({
  storybook,
  storybookVersion,
  addedGithubWorkflow,
  projectPageUrl,
}: {
  storybook: 'installed' | 'newer-setup' | 'older-setup';
  /** The installed `@storybook/react-native` version, which says whether the newer setup needs an upgrade first. */
  storybookVersion: string | undefined;
  /** Whether the project has the GitHub workflow setup adds, so the CI section can name it. */
  addedGithubWorkflow: boolean;
  /** The project's page in the web app, where a CI token is made. */
  projectPageUrl: string;
}): string[] {
  const newerSetupChoice = hasNewerSetup(storybookVersion)
    ? "a) Switch to Storybook's newer setup (recommended):"
    : `a) Upgrade Storybook to ${NEWER_SETUP_SINCE} or newer and switch to its newer setup (recommended):`;

  // EVERY STEP IS A TITLE AND ITS CONTENT: a bold line saying what, then indented lines in plain
  // weight, nothing dimmed, so a recommendation reads as clearly as the step it sits in.
  const storybookSteps: Record<typeof storybook, Array<{ title: string; content: string[] }>> = {
    installed: [
      {
        title: 'Replace the example stories',
        content: [
          "Swap Storybook's examples for your own components, so Sherlo tests your app's UI:",
          chalk.cyan('https://sherlo.io/docs/stories'),
        ],
      },
    ],
    'newer-setup': [],
    'older-setup': [
      {
        title: 'Give Sherlo access to Storybook - pick one:',
        content: [
          newerSetupChoice,
          `   ${chalk.cyan('https://sherlo.io/docs/setup#storybook-newer-setup')}`,
          'b) Or keep your setup and follow our guide for it:',
          `   ${chalk.cyan('https://sherlo.io/docs/setup#storybook-access')}`,
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

  const ciLines = addedGithubWorkflow
    ? [
        'Setup added a GitHub workflow that tests every pull request.',
        `It needs a CI token, saved as the ${chalk.bold('SHERLO_TOKEN')} secret:`,
      ]
    : [`Create a CI token and save it as the ${chalk.bold('SHERLO_TOKEN')} secret in your CI:`];

  return [
    // The underline is one longer than the title: the emoji is counted as one character and drawn as two.
    ...(steps.length === 1 ? renderSectionTitle('👉 Next step', 12) : renderSectionTitle('👉 Next steps', 13)),
    ...stepLines,
    ...renderSectionTitle('🔁 Test every pull request', 26),
    ...ciLines,
    `   ${chalk.cyan(projectPageUrl)}`,
  ];
}

/** The first `@storybook/react-native` with the newer setup, whose own entry starts the app. */
const NEWER_SETUP_SINCE = '10.4';

function hasNewerSetup(storybookVersion: string | undefined): boolean {
  const [major = 0, minor = 0] = (storybookVersion ?? '').split('.').map(Number);
  return major > 10 || (major === 10 && minor >= 4);
}

/** The line a finished run ends with, set apart by a thin rule: feedback is a side note. */
export function renderFeedbackLine(): string[] {
  return [
    '',
    chalk.dim('─'.repeat(10)),
    '',
    `Something unclear or broken? Tell us: ${chalk.cyan('npx sherlo feedback "<what happened>"')}`,
  ];
}

/**
 * What a failed run ends with, in place of the tool's usual help footer: one block, so feedback
 * and help read as one place to turn (operator, 2026-10-07).
 */
export function renderStuckBlock({ discordUrl, contactEmail }: { discordUrl: string; contactEmail: string }): string[] {
  return [
    chalk.dim('═'.repeat(10)),
    '',
    'Stuck or something broken?',
    `➜ Tell us: ${chalk.cyan('npx sherlo feedback "<what happened>"')}`,
    `➜ Discord: ${chalk.cyan(discordUrl)}`,
    `➜ Email: ${chalk.cyan(contactEmail)}`,
  ];
}
