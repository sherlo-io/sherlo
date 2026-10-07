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
  projectPageUrl,
}: {
  installedStorybook: boolean;
  /** The project's page in the web app, where a project token for CI is made. */
  projectPageUrl: string;
}): string[] {
  const steps: string[][] = [
    [
      'Let Sherlo open Storybook in your app.',
      chalk.dim(`↳ How: ${chalk.cyan('https://sherlo.io/docs/setup#storybook-access')}`),
    ],
    ...(installedStorybook
      ? [
          [
            'Recommended: replace the example stories with a story of one of your own',
            'components, so your first test shows your app.',
            chalk.dim(`↳ How: ${chalk.cyan('https://sherlo.io/docs/stories')}`),
          ],
        ]
      : []),
    ['Run your first visual test:', '', `  ${chalk.cyan('npx sherlo test')}`],
  ];

  return [
    // 13, not the title's own length: the emoji is counted as one character and drawn as two.
    ...renderSectionTitle('👉 Next steps', 13),
    ...steps.flatMap((lines, index) => [
      ...lines.map((line, lineIndex) => {
        if (lineIndex === 0) return `${index + 1}. ${line}`;
        return line === '' ? '' : `   ${line}`;
      }),
      '',
    ]),
    `${chalk.blue('INFO:')} On this computer, ${chalk.cyan('npx sherlo test')} needs no token, because it uses`,
    'the account you logged in with. For the GitHub workflow, create a project token at',
    `${chalk.cyan(projectPageUrl)} and add it to GitHub as the`,
    `${chalk.bold('SHERLO_TOKEN')} secret.`,
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
