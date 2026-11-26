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
import path from 'path';
import { WRITING_STORIES_GUIDE } from '../constants';
import { renderCode, renderSectionTitle } from './initLines';

/**
 * The file the app's root component is in, relative to the app's folder. `found` is false when the
 * app has none of the usual files; `file` is then the most common place, the import path's base.
 */
export interface RootComponentFile {
  file: string;
  found: boolean;
}

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
  // THE DETAIL IS SECONDARY, so it is dimmed and the step names read first.
  const shownDetail = [detail === '' ? '' : chalk.dim(detail), alreadyDoneMark]
    .filter((part) => part !== '')
    .join(' ');

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
 *   - `installed`: setup installed Storybook just now. Setup does not register Storybook as the app's
 *     root itself, as the person or their agent picks how Sherlo reaches it, so the first step is the
 *     same two choices as `old-setup`, with nothing to remove. Its stories are
 *     Storybook's examples, so the next step is to replace them with the app's own.
 *   - `default-setup`: the Storybook folder's index registers the app's root, and Sherlo reaches Storybook
 *     with no change to the app - no Storybook step at all.
 *   - `old-setup`: Storybook renders from the app's own root. Two equal choices, the recommended one
 *     first: move to the default setup, on any supported Storybook, or keep the
 *     old setup and render Storybook in Sherlo's testing mode - each with its code on the screen.
 *   - `example-stories` and `old-setup-example-stories`: the same as `default-setup` and
 *     `old-setup`, but the only stories are Storybook's examples, so the next step is to replace
 *     them with the app's own.
 *
 * The person reads "the default setup" and "the old setup", the same names everywhere.
 *
 * NO CI STEP HERE: setup has one goal, the first visual test. The GitHub workflow is already written
 * by setup's own step (../commands/init/steps/githubWorkflow) and ends green until GitHub is
 * connected; connecting it, or a CI token for another CI, is offered on the project page.
 */
/**
 * ONE TEXT FOR A PERSON AND AN AGENT: each step says what to do and every detail needed to do it,
 * with no docs link. Most agents ask before opening a link, or run with no network, and Vercel's
 * evals found docs in front of an agent beat docs behind a link - so the whole how is in the output.
 */
export function renderNextSteps({
  storybook,
  storybookFolder,
  isExpo,
  rootComponent,
  reader,
}: {
  storybook:
    | 'installed'
    | 'default-setup'
    | 'example-stories'
    | 'old-setup'
    | 'old-setup-example-stories';
  /**
   * The app's Storybook folder as the Metro wrapper finds it (../commands/init/steps/storybookFolder):
   * `.rnstorybook`, or `.storybook` kept by an app upgraded from Storybook 8.
   */
  storybookFolder: string;
  /** Expo registers the root with `registerRootComponent`, a bare app with `AppRegistry`. */
  isExpo: boolean;
  /** The file the app's root component is in (../commands/init/steps/rootComponentFile). */
  rootComponent: RootComponentFile;
  reader: FeedbackReader;
}): string[] {
  // NOTHING LEFT BUT THE TEST, FOR A PERSON: setup starts it, so nobody leaves it for later. The
  // line stays on the screen through the build, for whoever comes back to the terminal mid-way.
  if (storybook === 'default-setup' && reader === 'person') {
    return [
      ...renderSectionTitle('🚀 First visual test', 21),
      'Building your app so Sherlo can test it. This can take a while.',
    ];
  }

  // EVERY LINE OF BOTH CHOICES IS ON THE SCREEN: the code to add, the file it
  // goes in, and what to remove - no docs link, which an agent rarely opens.
  const registerRoot = isExpo
    ? [
        renderCode("import { registerRootComponent } from 'expo';"),
        renderCode('registerRootComponent(StorybookUIRoot);'),
      ]
    : [
        renderCode("import { AppRegistry } from 'react-native';"),
        renderCode("import { name as appName } from '../app.json';"),
        renderCode('AppRegistry.registerComponent(appName, () => StorybookUIRoot);'),
      ];
  // A STORYBOOK SETUP JUST INSTALLED has no code of the app's own that renders Storybook, so there
  // is nothing to remove. NO UPGRADE ON ANY SUPPORTED VERSION: Sherlo's withStorybook does the swap,
  // so the registration opens Storybook on 9.0 as on 10 (proven on device, Expo and bare).
  const isFreshInstall = storybook === 'installed';
  const removeOldRender = isFreshInstall
    ? []
    : ["   Then remove your app's code that renders Storybook, and its import."];
  // EACH CHOICE IS A BLOCK: its name bold and alone on its line, a blank line between the two, so
  // the eye finds a) and b) before reading either.
  const defaultSetupChoice = [
    // WHY RECOMMENDED, IN TWO WORDS: it is what a new Storybook sets up.
    chalk.bold("a) Entry-point swapping (Storybook's default, recommended)"),
    `   In ${storybookFolder}/index.ts, below StorybookUIRoot, add:`,
    ...registerRoot.map((line) => `     ${line}`),
    ...removeOldRender,
  ];
  // THE SAME TWO CHOICES after a fresh install and on the old setup; only the reason Sherlo can't
  // open Storybook alone differs.
  const openStorybookStep = (reason: string) => ({
    title: 'Let Sherlo open Storybook',
    content: [`${reason} Pick one:`, '', ...defaultSetupChoice, '', ...keepSetupChoice],
  });
  // THE IMPORT PATH GOES FROM THE ROOT COMPONENT'S FILE, so the line names the file setup found,
  // never a guess. With none found it names no file, and a comment says which file the path is
  // from: the most common place, so the path is right for most apps and checkable for the rest.
  const relativeStorybookPath = path.posix.relative(
    path.posix.dirname(rootComponent.file),
    storybookFolder
  );
  const storybookPath = /^\.\.?\//.test(relativeStorybookPath)
    ? relativeStorybookPath
    : `./${relativeStorybookPath}`;
  const storybookImport = `import Storybook from '${storybookPath}';`;
  // BOTH CHOICES WORK ON EVERY APP: Sherlo's build is Storybook alone either way, so an app that
  // exports its routes for the server builds it too.
  const keepSetupChoice = [
    chalk.bold('b) In-app integration'),
    rootComponent.found
      ? `   At the top of your root component (${rootComponent.file}), add:`
      : '   At the top of your root component, add:',
    `     ${renderCode("import { isStorybookMode } from '@sherlo/react-native-storybook';")}`,
    `     ${renderCode(rootComponent.found ? storybookImport : `${storybookImport} // path from ${rootComponent.file}`)}`,
    `     ${renderCode('if (isStorybookMode) return <Storybook />;')}`,
  ];

  // EVERY STEP IS A TITLE AND ITS CONTENT: a bold line saying what, then indented lines in plain
  // weight, nothing dimmed, so a recommendation reads as clearly as the step it sits in.
  const replaceExampleStoriesStep = {
    title: 'Replace the example stories',
    // WHERE STORYBOOK LOOKS: an agent told to write "your components' stories" writes them where
    // Storybook never loads them.
    content: [
      // WHY FIRST, THEN A SMALL START: the examples must go because Sherlo would test them, and
      // a few components are enough to begin, so the step never reads as a big job.
      "Right now Sherlo would test Storybook's examples, not your app.",
      // A FOLDER, NOT A PATTERN: Storybook finds every story file under it, and the examples
      // outside it drop out, so they need no deleting.
      `Set "stories" in ${storybookFolder}/main.ts to your code's folder, e.g. ${renderCode("['../src']")}.`,
      // A BLANK LINE BETWEEN PARTS - what to change, an example, where to read more - so each is
      // found without reading the others.
      '',
      'You can start with a few components or screens, one story per state:',
      // ONE STORY FILE, TWO STATES, so it is on the screen whole; the rest of the how -
      // providers, steady screenshots, Sherlo's parameters - is in the guide the SDK ships.
      `  ${renderCode('// Button.stories.tsx')}`,
      `  ${renderCode("import { Button } from './Button';")}`,
      `  ${renderCode('export default { component: Button };')}`,
      // EACH LABEL NAMES ITS STATE, so a screenshot says what it shows.
      `  ${renderCode("export const Default = { args: { title: 'Default' } };")}`,
      `  ${renderCode("export const Disabled = { args: { title: 'Disabled', disabled: true } };")}`,
      '',
      // AN INSTRUCTION, NOT A TOPIC: "How to write stories" read as basics the snippet covers.
      'Before you write stories, read:',
      `  ${chalk.cyan(WRITING_STORIES_GUIDE)}`,
    ],
  };

  // THE FIRST TEST COMES LAST, after the app's own stories, so it never photographs Storybook's
  // examples - and it is still listed, so an agent that wrote the stories knows what runs next.
  const storybookSteps: Record<typeof storybook, Array<{ title: string; content: string[] }>> = {
    installed: [
      openStorybookStep(
        "Storybook is installed, but your app doesn't start it yet, so Sherlo can't open it."
      ),
      replaceExampleStoriesStep,
    ],
    'default-setup': [],
    // The app's Storybook is the person's own and already opens, but the stories are still
    // Storybook's examples.
    'example-stories': [replaceExampleStoriesStep],
    'old-setup': [
      openStorybookStep("Storybook starts from your app's code, so Sherlo can't open it alone."),
    ],
    'old-setup-example-stories': [
      openStorybookStep("Storybook starts from your app's code, so Sherlo can't open it alone."),
      replaceExampleStoriesStep,
    ],
  };

  const steps = [
    ...storybookSteps[storybook],
    {
      title: 'Run your first visual test',
      // THE WAIT IS FOR AGENTS ONLY: a build outlasts an agent's command time limit, so it is told
      // not to let it time out - the goal, not a way, as agents differ in what they can do. A person
      // told it takes long may leave it for later, so a person reads the command alone. No number:
      // the time depends on the app and the machine.
      content: [
        chalk.cyan('npx sherlo test'),
        ...(reader === 'agent'
          ? [
              "AI agents: the first run builds the app and can take a long time, so don't let it time out.",
            ]
          : []),
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

/**
 * WHO READS THE FEEDBACK LINE: a person's terminal gets the line for a
 * person; anything else - an agent's shell, a CI log - gets one addressed to agents, after a
 * finished run as much as after a failed one.
 *
 * THE AGENT'S LINE ASKS PLAINLY, WITH ITS REASON: the aim is as many reports as possible, so it
 * tells the agent to report and says why, as a bare order to send data out reads like prompt
 * injection. The benchmark compares it with and without the reason. They point at `npx sherlo feedback --help`, which explains how a report is written. They are
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
  `AI agents: if anything was unclear, broken, slow or harder than it should be, tell the Sherlo team so we can fix it: ${chalk.cyan(FEEDBACK_HELP)}`;

/**
 * What a finished run ends with, for an agent only: a person who just
 * finished setting up has nothing to report, and the last line they read should be the next step.
 */
export function renderFeedbackLine({ reader }: { reader: FeedbackReader }): string[] {
  if (reader === 'person') return [];

  return ['', ...sideNoteSeparator(), agentFeedbackLine()];
}

/**
 * What a failed run ends with, in place of the tool's usual help footer.
 *
 * FEEDBACK IS NOT HELP: the agent's feedback line stands on its own under "Need help?", as it
 * stands on its own after a finished run, rather than as one more place to turn.
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
          'AI agents: you can fix most of these errors yourself. Only those that offer a choice need the user.',
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
    `➜ Discord: ${chalk.cyan(discordUrl)}`,
    `➜ Email: ${chalk.cyan(contactEmail)}`,
    ...(showsFeedbackLine ? ['', agentFeedbackLine()] : []),
  ];
}
