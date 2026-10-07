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
 * The next steps, in their own section, numbered in the order they are done.
 *
 * The example-stories step shows only when this run installed Storybook: a project that already
 * had Storybook already has stories of its own.
 */
export function renderNextSteps({
  installedStorybook,
  storybookSetup,
  projectPageUrl,
}: {
  installedStorybook: boolean;
  /**
   * Storybook's newer setup registers the app's root in `.rnstorybook/index`, and Sherlo reaches it
   * with no change to the app; an older one renders Storybook from the app, so the person adds
   * Sherlo there.
   */
  storybookSetup: 'registers-root' | 'renders-in-app';
  /** The project's page in the web app, where a project token for CI is made. */
  projectPageUrl: string;
}): string[] {
  const storybookAccessSteps =
    storybookSetup === 'registers-root'
      ? [
          {
            what: "If your stories need your app's providers, add them as decorators in .rnstorybook/preview.tsx.",
            how: chalk.dim(`↳ How: ${chalk.cyan('https://sherlo.io/docs/setup#providers')}`),
          },
        ]
      : [
          {
            what: 'Give Sherlo access to Storybook in your app.',
            how: chalk.dim(`↳ How: ${chalk.cyan('https://sherlo.io/docs/setup#storybook-access')}`),
          },
          {
            what: "Optional: move to Storybook's newer setup, which needs no change in your app.",
            how: chalk.dim(`↳ How: ${chalk.cyan('https://sherlo.io/docs/setup#storybook-newer-setup')}`),
          },
        ];

  // Every step is the same shape: what to do, then one indented line of how.
  const steps: Array<{ what: string; how: string }> = [
    ...storybookAccessSteps,
    ...(installedStorybook
      ? [
          {
            what: 'Recommended: replace the example stories with your own components.',
            how: chalk.dim(`↳ How: ${chalk.cyan('https://sherlo.io/docs/stories')}`),
          },
        ]
      : []),
    { what: 'Run your first visual test:', how: chalk.cyan('npx sherlo test') },
  ];

  // No CI is named: the token works on any CI, the GitHub workflow included.
  return [
    // 13, not the title's own length: the emoji is counted as one character and drawn as two.
    ...renderSectionTitle('👉 Next steps', 13),
    ...steps.flatMap(({ what, how }, index) => [`${index + 1}. ${what}`, `   ${how}`, '']),
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

  return under === 'next-steps' ? ['', line] : [line, ''];
}
