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
 *   - `older-setup`: Storybook renders from the app's own root, so the person gives Sherlo access
 *     there - or, recommended, moves to the newer setup, which needs no change.
 */
export function renderNextSteps({
  storybook,
  projectPageUrl,
}: {
  storybook: 'installed' | 'newer-setup' | 'older-setup';
  /** The project's page in the web app, where a project token for CI is made. */
  projectPageUrl: string;
}): string[] {
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
        title: 'Give Sherlo access to Storybook',
        content: [
          "Add Sherlo to your app's root component:",
          chalk.cyan('https://sherlo.io/docs/setup#storybook-access'),
          '',
          "Recommended instead: switch to Storybook's newer setup, which needs no change in your app:",
          chalk.cyan('https://sherlo.io/docs/setup#storybook-newer-setup'),
        ],
      },
    ],
  };

  const steps = [
    ...storybookSteps[storybook],
    { title: 'Run your first visual test', content: [chalk.cyan('npx sherlo test')] },
  ];

  // ONE STEP IS NOT A LIST: it gets a singular title and no number.
  const stepLines =
    steps.length === 1
      ? [chalk.bold(steps[0].title), ...steps[0].content.map((line) => `  ${line}`), '']
      : steps.flatMap(({ title, content }, index) => [
          chalk.bold(`${index + 1}. ${title}`),
          ...content.map((line) => (line === '' ? '' : `   ${line}`)),
          '',
        ]);

  // No CI is named: the token works on any CI, the GitHub workflow included.
  return [
    // The underline is one longer than the title: the emoji is counted as one character and drawn as two.
    ...(steps.length === 1 ? renderSectionTitle('👉 Next step', 12) : renderSectionTitle('👉 Next steps', 13)),
    ...stepLines,
    `${chalk.blue('INFO:')} For CI, create a project token and add it as the ${chalk.bold('SHERLO_TOKEN')} secret:`,
    `      ${chalk.cyan(projectPageUrl)}`,
  ];
}

/**
 * The line every run ends with, a finished one and a failed one alike. Under an error it stands
 * apart from the help footer: feedback is not a request for help.
 */
export function renderFeedbackLine({ under }: { under: 'next-steps' | 'error' }): string[] {
  const line = `Something unclear or broken? Tell us: ${chalk.cyan('npx sherlo feedback "<what happened>"')}`;
  // A thin rule above it marks it as a side note, apart from the steps or the error.
  const rule = chalk.dim('─'.repeat(10));

  return under === 'next-steps' ? ['', rule, line] : [rule, line, ''];
}
