/**
 * WHAT `sherlo init` PRINTS AS IT GOES: one line per step, then the
 * next steps in a section of their own, then the feedback line.
 *
 * Every step ends in one line, so the whole run fits on one screen, and a rerun reads as the same
 * list with each finished step marked as already done. The next steps keep a titled section,
 * because they are what the person, or their agent, does next.
 *
 * Pure, like everything under ./: state in, print-call arguments out.
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
  // A step with nothing to add but that it was already done reads `(already done)` alone.
  const alreadyDoneMark = outcome === 'already' ? chalk.dim('(already done)') : '';
  const shownDetail = [detail, alreadyDoneMark].filter((part) => part !== '').join(' ');

  return `${chalk.green('✔')} ${name.padEnd(STEP_NAME_WIDTH)} ${shownDetail}`;
}

/** The line a step that failed prints, above the error that says why. */
export function renderFailedStepLine(name: string): string[] {
  return [`${chalk.red('✖')} ${name}`, ''];
}

/**
 * The next steps, in their own section, numbered in the order they are done. The first ones
 * depend on the Storybook the project had:
 *
 *   - `installed`: setup installed Storybook just now, on its default setup, which needs nothing in
 *     the app. Its stories are Storybook's examples, so the step is to replace them with the app's own.
 *   - `default-setup`: `.rnstorybook/index` registers the app's root, and Sherlo reaches Storybook
 *     with no change to the app - no Storybook step at all.
 *   - `old-setup`: Storybook renders from the app's own root. Two equal choices, the recommended one
 *     first: move to the default setup (upgrading Storybook first when it predates it), or keep the
 *     old setup and render Storybook in Sherlo's testing mode - each with its code on the screen.
 *
 * The person reads "the default setup" and "the old setup", the same names everywhere.
 *
 * NO CI HERE: setup has one goal, the first visual test. Pull request tests are offered after that
 * test succeeds - by `sherlo test`'s own output and the project page - and to anyone whose machine
 * cannot build, by `sherlo test`'s build-failure line.
 */
/**
 * ONE TEXT FOR A PERSON AND AN AGENT: each step says what to do and every detail needed to do it,
 * with no docs link. Most agents ask before opening a link, or run with no network, and Vercel's
 * evals found docs in front of an agent beat docs behind a link - so the whole how is in the output.
 */
export function renderNextSteps({
  storybook,
  storybookVersion,
  isExpo,
}: {
  storybook: 'installed' | 'default-setup' | 'old-setup';
  /** The installed `@storybook/react-native` version, which says whether the default setup needs an upgrade first. */
  storybookVersion: string | undefined;
  /** Expo registers the root with `registerRootComponent`, a bare app with `AppRegistry`. */
  isExpo: boolean;
}): string[] {
  // EVERY LINE OF BOTH CHOICES IS ON THE SCREEN: the code to add, the file it
  // goes in, and what to remove - no docs link, which an agent rarely opens.
  const code = (line: string): string => chalk.cyan(line);
  const registerRoot = isExpo
    ? [
        code("import { registerRootComponent } from 'expo';"),
        code('registerRootComponent(StorybookUIRoot);'),
      ]
    : [
        code("import { AppRegistry } from 'react-native';"),
        code("import { name as appName } from '../app.json';"),
        code('AppRegistry.registerComponent(appName, () => StorybookUIRoot);'),
      ];
  const upgradeFirst = hasDefaultSetup(storybookVersion)
    ? []
    : [
        `   First upgrade every @storybook/* package to ${DEFAULT_SETUP_SINCE} or newer, the first with it.`,
      ];
  const defaultSetupChoice = [
    "a) Switch to Storybook's default setup (recommended) - your app stays as it is:",
    ...upgradeFirst,
    '   In .rnstorybook/index.ts, register Storybook as the root, under the line that makes',
    '   StorybookUIRoot:',
    ...registerRoot.map((line) => `     ${line}`),
    '   Then remove the code that renders Storybook from your app, with its import of',
    '   .rnstorybook: importing it would now start Storybook in place of your app.',
  ];
  const keepSetupChoice = [
    'b) Or keep your setup: render Storybook when Sherlo tests the app. At the top of your',
    '   root component:',
    `     ${code("import { isStorybookMode } from '@sherlo/react-native-storybook';")}`,
    `     ${code("import Storybook from './.rnstorybook';")}`,
    `     ${code('if (isStorybookMode) return <Storybook />;')}`,
  ];

  // EVERY STEP IS A TITLE AND ITS CONTENT: a bold line saying what, then indented lines in plain
  // weight, nothing dimmed, so a recommendation reads as clearly as the step it sits in.
  const storybookSteps: Record<typeof storybook, Array<{ title: string; content: string[] }>> = {
    installed: [
      {
        title: 'Replace the example stories',
        // WHERE STORYBOOK LOOKS: an agent told to write "your components' stories" writes them where
        // Storybook never loads them.
        content: [
          // WHY FIRST, THEN WHAT, THEN HOW: a person reads why it matters - their real UI gets
          // tested - and an agent gets each action it must take. The folder is named as Storybook's
          // examples, so nobody takes it for where stories belong.
          "Sherlo tests what your stories show, so write them for your app's components",
          "and delete Storybook's examples in .rnstorybook/stories.",
          'Storybook loads only the folders listed in .rnstorybook/main.ts, so add yours there.',
          // THE HOW IS ON THE SCREEN, NOT IN A FILE: one story file is three lines, so it is shown
          // whole.
          'A story file sits beside its component, one export per state Sherlo should photograph:',
          `  ${chalk.cyan('// Button.stories.tsx')}`,
          `  ${chalk.cyan('export default { component: Button };')}`,
          `  ${chalk.cyan("export const Primary = { args: { title: 'Buy' } };")}`,
        ],
      },
    ],
    'default-setup': [],
    'old-setup': [
      {
        title: 'Give Sherlo access to Storybook - pick one:',
        content: [...defaultSetupChoice, ...keepSetupChoice],
      },
    ],
  };

  const steps = [
    ...storybookSteps[storybook],
    {
      title: 'Run your first visual test',
      // THE WAIT IS SAID BEFORE IT STARTS: a build outlasts an agent's usual command time limit,
      // and an agent that kills it reads a hang. Said as what is possible, like the feedback line.
      content: [
        chalk.cyan('npx sherlo test'),
        'The first test builds your app, so it can take a while - longer than an agent',
        "command's usual time limit, so an AI agent can run it in the background and wait.",
      ],
    },
  ];

  // ONE STEP IS NOT A LIST: it gets a singular title and no number. Content lines start in one
  // column everywhere in this section.
  const stepLines =
    steps.length === 1
      ? [chalk.bold(steps[0].title), ...steps[0].content.map((line) => `   ${line}`), '']
      : steps.flatMap(({ title, content }, index) => [
          chalk.bold(`${index + 1}. ${title}`),
          ...content.map((line) => (line === '' ? '' : `   ${line}`)),
          '',
        ]);

  return [
    // The underline is one longer than the title: the emoji is counted as one character and drawn as two.
    ...(steps.length === 1
      ? renderSectionTitle('👉 Next step', 12)
      : renderSectionTitle('👉 Next steps', 13)),
    // The last step's blank line goes: nothing follows it in this section.
    ...stepLines.slice(0, -1),
  ];
}

/** The first `@storybook/react-native` with the default setup, whose own entry starts the app. */
const DEFAULT_SETUP_SINCE = '10.4';

function hasDefaultSetup(storybookVersion: string | undefined): boolean {
  const [major = 0, minor = 0] = (storybookVersion ?? '').split('.').map(Number);
  return major > 10 || (major === 10 && minor >= 4);
}

/**
 * WHO READS THE FEEDBACK LINE: a person's terminal gets the line for a
 * person; anything else - an agent's shell, a CI log - gets one addressed to agents, after a
 * finished run as much as after a failed one.
 *
 * THE LINES INFORM, NEVER ORDER: an agent may ignore or
 * flag an instruction inside a command's output as prompt injection, so they say what is possible.
 * They point at `npx sherlo feedback --help`, which explains how a report is written. They are
 * init's own: the feedback command invites from no other command.
 */
export type FeedbackReader = 'person' | 'agent';

const FEEDBACK_HELP = 'npx sherlo feedback --help';

/**
 * One separator for every side note at the end of a run, finished or failed.
 * Functions, not constants: colour is decided per run, after this module loads.
 */
// A THIN LINE, NOT THE SECTION TITLES' DOUBLE ONE, so a side note never
// reads as a section of its own.
const sideNoteSeparator = (): string[] => [chalk.dim('─'.repeat(10)), ''];

const agentFeedbackLine = (): string =>
  `AI agents: report anything unclear or broken to the Sherlo team: ${chalk.cyan(FEEDBACK_HELP)}`;

/**
 * What a finished run ends with, for an agent only: a person who just
 * finished setting up has nothing to report, and the last line they read should be the next step.
 */
export function renderFeedbackLine({ reader }: { reader: FeedbackReader }): string[] {
  if (reader === 'person') return [];

  return ['', ...sideNoteSeparator(), agentFeedbackLine()];
}

/**
 * What a failed run ends with, in place of the tool's usual help footer: one block, so feedback
 * and help read as one place to turn.
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
  // AN AGENT CAN FIX IT ITSELF: the person should only have to ask for
  // setup. Said as what is possible, not as an order, for the reason above.
  const agentLines =
    reader === 'agent'
      ? [
          `AI agents: this error can usually be fixed without the person, and ${chalk.cyan(
            'npx sherlo init'
          )} run again picks up where it stopped.`,
          'Only a fix that is a real choice between options needs the person.',
          '',
        ]
      : [];
  // THE FEEDBACK COMMAND IS FOR AGENTS ONLY: a person is offered Discord and
  // email, under the help block's usual "Need help?".
  const showsFeedbackLine = reader === 'agent' && isLoggedIn;

  return [
    ...agentLines,
    ...sideNoteSeparator(),
    'Need help?',
    ...(showsFeedbackLine ? [`➜ ${agentFeedbackLine()}`] : []),
    `➜ Discord: ${chalk.cyan(discordUrl)}`,
    `➜ Email: ${chalk.cyan(contactEmail)}`,
  ];
}
