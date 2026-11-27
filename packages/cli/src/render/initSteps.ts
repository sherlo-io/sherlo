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
import {
  modeImportLine,
  startFileBranch,
  wholeStartFile,
} from '../commands/init/storybookAccess/startFileBranch';
import typedInitCommand from '../commands/init/typedInitCommand';
import { WRITING_STORIES_GUIDE } from '../constants';
import {
  importPath,
  renderCode,
  renderSectionTitle,
  renderStorybookIndexFile,
  renderStorybookMainFile,
  storiesGlob,
} from './initLines';

/**
 * The file the app's root component is in, relative to the app's folder. `found` is false when the
 * app has none of the usual files; `file` is then the most common place, the import path's base.
 */
export interface RootComponentFile {
  file: string;
  found: boolean;
  /**
   * How the file exports the root component, as its line reads, so the in-app way names the exact
   * change: `declared` for `export default function App() {` (or a class, or an unnamed
   * `export default () =>`) with `rewritten` the same start without the export (`const App = () =>`
   * for an unnamed one), `named` for a separate `export default App;`, `wrapped` for
   * `export default Sentry.wrap(App);` with `call` the wrapping call (`Sentry.wrap`), kept around
   * the switch, `switched` for Storybook's old switch (`let AppEntryPoint = App;` set to Storybook
   * in an `if`) with `name` the app it holds and `switchCode` its lines, to be removed, `ternary`
   * for one line picking Storybook or the app (`export default ... ? StorybookUIRoot : App;`) with
   * `name` the app and `storybookImport` the line importing Storybook, to be removed. Null when
   * the file is missing or exports it another way (nested wrappers, a lowercase name): the generic
   * form is shown.
   */
  defaultExport:
    | { form: 'declared'; line: string; rewritten: string; name: string }
    | { form: 'named'; line: string; name: string }
    | { form: 'switched'; line: string; name: string; switchCode: string[] }
    | { form: 'ternary'; line: string; name: string; storybookImport: string }
    | { form: 'wrapped'; line: string; name: string; call: string }
    | null;
}

/**
 * How Storybook's root is registered, so the app's native code opens it
 * (../commands/init/steps/rootRegistration). `main`: Expo's `registerRootComponent`, which registers
 * the name "main". `named`: `AppRegistry.registerComponent` under the name the native code opens;
 * `inAppJson` when app.json's `name` is that name, so the code imports it rather than repeating it.
 */
export type RootRegistration =
  | { registers: 'main' }
  | { registers: 'named'; name: string; inAppJson: boolean };

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

/**
 * The config step's line. `existed`: the app had a sherlo.config.json before this run, so setup
 * updated it; `addedDevices`: the devices setup wrote because the file had none, by display name.
 */
export function renderConfigLine({
  outcome,
  existed,
  file,
  addedDevices,
}: {
  outcome: StepOutcome;
  existed: boolean;
  file: string;
  addedDevices: string[];
}): string {
  return renderStepLine({
    outcome,
    name: outcome === 'done' && existed ? 'Updated config' : 'Created config',
    detail: addedDevices.length > 0 ? `${file}, one device: ${addedDevices.join(', ')}` : file,
  });
}

/**
 * The line for the pnpm settings file setup wrote so pnpm runs Storybook's install scripts: a file
 * of the person's that setup changed is named, as metro.config.js is. `had`: the file was there.
 */
export function renderPnpmSettingsLine({ had, file }: { had: boolean; file: string }): string {
  return renderStepLine({
    outcome: 'done',
    name: had ? 'Updated pnpm settings' : 'Created pnpm settings',
    detail: file,
  });
}

/** The line a step that failed prints, above the error that says why. */
export function renderFailedStepLine(name: string): string[] {
  return [`${chalk.red('✖')} ${name}`, ''];
}

/**
 * Setup's steps, by what each one did. SETUP'S STEP NAMES ARE WRITTEN HERE, with every other line
 * it prints, so the reach test (../commands/pose/__tests__/initRenderReach.test.ts) sees which ones
 * a pose draws; `sherlo test` names its own steps (./testSteps).
 */
export type InitStep =
  | 'checked-the-app'
  | 'logged-in'
  | 'using-team'
  | 'using-project'
  | 'created-team'
  | 'created-project'
  | 'installed-storybook'
  | 'added-for-storybook'
  | 'installed-sherlo'
  | 'updated-sherlo'
  | 'created-metro-config'
  | 'updated-metro-config'
  | 'updated-storybook-start-file'
  | 'added-github-workflow'
  | 'added-agent-skill';

/** The one line a finished step of setup prints. */
export function renderInitStepLine({
  step,
  outcome,
  detail,
}: {
  step: InitStep;
  outcome: StepOutcome;
  detail: string;
}): string {
  return renderStepLine({ outcome, name: initStepName(step), detail });
}

function initStepName(step: InitStep): string {
  switch (step) {
    case 'checked-the-app':
      // "THE APP", NOT "THE PROJECT": project is the Sherlo project the later steps create or use.
      return 'Checked the app';
    case 'logged-in':
      return 'Logged in';
    case 'using-team':
      return 'Using team';
    case 'using-project':
      return 'Using project';
    case 'created-team':
      return 'Created team';
    case 'created-project':
      return 'Created project';
    case 'installed-storybook':
      return 'Installed Storybook';
    case 'added-for-storybook':
      return 'Added for Storybook';
    case 'installed-sherlo':
      return 'Installed Sherlo';
    case 'updated-sherlo':
      return 'Updated Sherlo';
    case 'created-metro-config':
      return 'Created Metro config';
    case 'updated-metro-config':
      return 'Updated Metro config';
    // NAMED BY THE FILE IT CHANGED, like the config and Metro lines, short enough for the column;
    // the detail names the file (.rnstorybook/index.ts).
    case 'updated-storybook-start-file':
      return 'Updated start file';
    case 'added-github-workflow':
      return 'Added GitHub workflow';
    case 'added-agent-skill':
      return 'Added agent skill';
  }
}

/**
 * The agent skill step's line: the skill, the folders it was written in, and the files that point
 * the coding agent at it (AGENTS.md always, CLAUDE.md when the app has one that does not import
 * AGENTS.md), each told as created or updated in this run, like the config and Metro lines, and as
 * named in when this run left it as it was. Paths are from the app's folder.
 */
export function renderAgentSkillLine({
  outcome,
  skillsFolders,
  pointerFiles,
}: {
  outcome: StepOutcome;
  /** The folders the guide is in: `.agents/skills`, `.claude/skills`. */
  skillsFolders: string[];
  pointerFiles: Array<{ file: string; change: 'created' | 'updated' | 'none' }>;
}): string {
  const filesThat = (change: 'created' | 'updated' | 'none') =>
    pointerFiles.filter((pointer) => pointer.change === change).map(({ file }) => file);
  const told = [
    { words: 'created', files: filesThat('created') },
    { words: 'updated', files: filesThat('updated') },
    { words: 'named in', files: filesThat('none') },
  ].filter(({ files }) => files.length > 0);
  return renderInitStepLine({
    step: 'added-agent-skill',
    outcome,
    detail: [
      `sherlo-tests in ${skillsFolders.join(' and ')}`,
      ...told.map(({ words, files }) => `${words} ${files.join(' and ')}`),
    ].join(', '),
  });
}

/**
 * The line of a scenes start file setup could not write, with what to do, for a team with scenes
 * on: a scene launch opens the app from Storybook's start file, so scenes can't start until it is
 * fixed. `rerun`: the setup command to run again.
 */
export function renderScenesCantStartLine({
  reason,
  startFile,
}: {
  reason: 'not-one-registration' | 'no-app-entry';
  /** The start file, from the app's folder, as setup looked for it: `.rnstorybook/index.ts`. */
  startFile: string;
}): string {
  // The rerun is the command as typed, as every refusal names it (./initFixes).
  const rerun = renderCode(typedInitCommand());
  const fix =
    reason === 'not-one-registration'
      ? `${startFile} must register its root once, in a line of its own: fix it`
      : `"main" in package.json names no file and the app has no index file: set "main" to your app's entry file`;
  return `${chalk.yellow('◦')} ${"Scenes can't start yet".padEnd(STEP_NAME_WIDTH)} ${fix}, then run ${rerun}`;
}

/** The workflow step's line when the code is not on GitHub, so setup writes no workflow. */
export function renderNoGithubWorkflowLine(): string {
  return renderStepLine({
    outcome: 'done',
    name: 'No GitHub workflow',
    detail: 'the code is not on GitHub',
  });
}

/** Setup's steps that can stop the run, by what each one was doing. */
export type FailedInitStep =
  | 'checking-the-app'
  | 'logging-in'
  | 'finding-the-project'
  | 'choosing-a-team'
  | 'choosing-a-project'
  | 'creating-a-team'
  | 'creating-the-project'
  | 'installing-storybook'
  | 'installing-sherlo'
  | 'creating-config'
  | 'updating-config'
  | 'reading-team-features'
  | 'creating-metro-config'
  | 'updating-metro-config'
  | 'adding-github-workflow';

/** The red line of a setup step that stopped, above the error that says why. */
export function renderFailedInitStepLine(step: FailedInitStep): string[] {
  return renderFailedStepLine(`${initStepActivity(step)} failed`);
}

/** The spinner's words while one of setup's two installs runs, the longest waits it has. */
export function renderRunningInstallStep(
  step: 'installing-storybook' | 'installing-sherlo'
): string {
  return `${initStepActivity(step)}...`;
}

function initStepActivity(step: FailedInitStep): string {
  switch (step) {
    case 'checking-the-app':
      return 'Checking the app';
    case 'logging-in':
      return 'Logging in';
    case 'finding-the-project':
      return 'Finding the project';
    case 'choosing-a-team':
      return 'Choosing a team';
    case 'choosing-a-project':
      return 'Choosing a project';
    case 'creating-a-team':
      return 'Creating a team';
    case 'creating-the-project':
      return 'Creating the project';
    case 'installing-storybook':
      return 'Installing Storybook';
    case 'installing-sherlo':
      return 'Installing Sherlo';
    case 'creating-config':
      return 'Creating config';
    case 'updating-config':
      return 'Updating config';
    case 'reading-team-features':
      return "Reading the team's features";
    case 'creating-metro-config':
      return 'Creating Metro config';
    case 'updating-metro-config':
      return 'Updating Metro config';
    case 'adding-github-workflow':
      return 'Adding GitHub workflow';
  }
}

/**
 * A saved login the service refused, said while setup logs in again in the same run: the blank
 * line and the sentence, which the terminal erases once Authorize is clicked. Setup logs in again
 * itself, so it does not list the causes the other commands' refusal names
 * (`REJECTED_LOGIN_MESSAGE`), whose reader must log in by hand.
 */
export function renderSavedLoginRejected(): string[] {
  // WHAT IS KNOWN, NOT WHY: a 401 says the login no longer works, never that it expired.
  return ['', 'Your saved login no longer works. Log in again to continue.'];
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
 *   - `not-started`: Storybook was installed before, but no app file imports its folder, so nothing
 *     starts it: the same two choices as `installed`, with nothing to remove.
 *   - `example-stories`, `old-setup-example-stories` and `not-started-example-stories`: the same as
 *     `default-setup`, `old-setup` and `not-started`, but the only stories are Storybook's
 *     examples, so the next step is to replace them with the app's own.
 *
 * The person reads "the default setup" and "the old setup", the same names everywhere.
 *
 * NO CI STEP HERE: setup has one goal, the first visual test. The GitHub workflow is already written
 * by setup's own step (../commands/init/steps/githubWorkflow) and ends green until GitHub is
 * connected; connecting it, or a CI token for another CI, is offered on the project page.
 */
/**
 * Why the app's story list could not be read: its Storybook folder has no main file, or the main
 * file threw, with the first line of what it threw.
 */
export type StoryListUnreadable = 'main-file-missing' | { loadError: string };

/**
 * ONE TEXT FOR A PERSON AND AN AGENT: each step says what to do and every detail needed to do it,
 * with no docs link. Most agents ask before opening a link, or run with no network, and Vercel's
 * evals found docs in front of an agent beat docs behind a link - so the whole how is in the output.
 */
export function renderNextSteps({
  storybook,
  storyListUnreadable,
  leftOutStory,
  storybookFolder,
  storybookIndexFile,
  hasStartFile,
  storybookMainFile,
  storiesFolder,
  rootRegistration,
  rootComponent,
  scenesAppEntry,
  reader,
}: {
  storybook:
    | 'installed'
    | 'default-setup'
    | 'example-stories'
    | 'old-setup'
    | 'old-setup-example-stories'
    | 'not-started'
    | 'not-started-example-stories';
  /**
   * Why the app's story list could not be read (../commands/init/steps/hasStoriesOfItsOwn), or
   * null. With it, setup cannot tell the app's stories from Storybook's examples, so the line is
   * shown and the first test is not started for the person.
   */
  storyListUnreadable: StoryListUnreadable | null;
  /**
   * A story file of the app that the main config's `stories` leave out (`src/Button.stories.tsx`,
   * from the app's folder), when Storybook loads none of the app's own: the step then names it
   * and the exact list that loads it, as the app already has stories to show.
   */
  leftOutStory: string | null;
  /**
   * The app's Storybook folder as the Metro wrapper finds it (../commands/init/steps/storybookFolder):
   * `.rnstorybook`, or `.storybook` kept by an app upgraded from Storybook 8. Null when setup found
   * none: the steps then name no folder and no file in it, as any name would be a guess.
   */
  storybookFolder: string | null;
  /** The folder's index and main files as the app has them (`.storybook/main.js`), from the app's folder. */
  storybookIndexFile: string | null;
  /**
   * Whether the index file is there. Storybook's start file is that file, so with none the steps
   * print it whole, to create.
   */
  hasStartFile: boolean;
  storybookMainFile: string | null;
  /**
   * The folder the steps load and write stories in (../commands/init/steps/folderForStories), one
   * the app has, from the app's folder: `src/components`, `src`, or `.` for the app's folder itself.
   */
  storiesFolder: string;
  rootRegistration: RootRegistration;
  /** The file the app's root component is in (../commands/init/steps/rootComponentFile). */
  rootComponent: RootComponentFile;
  /**
   * With scenes on, the app's entry as Storybook's start file requires it (`../index`), when the
   * start file registers nothing yet or is not there (../commands/init/storybookAccess/writeStartFile): the
   * registration the steps print then opens the app outside Storybook mode. Null otherwise.
   */
  scenesAppEntry: string | null;
  reader: FeedbackReader;
}): string[] {
  // NOTHING LEFT BUT THE TEST, FOR A PERSON: setup starts it, so nobody leaves it for later. The
  // line stays on the screen through the build, for whoever comes back to the terminal mid-way.
  if (storybook === 'default-setup' && reader === 'person' && !storyListUnreadable) {
    return [
      ...renderSectionTitle('🚀 First visual test', 21),
      'Building your app so Sherlo can test it. This can take a while.',
    ];
  }

  // EVERY LINE OF BOTH CHOICES IS ON THE SCREEN: the code to add, the file it
  // goes in, and what to remove - no docs link, which an agent rarely opens.
  // THE NAME THE NATIVE CODE OPENS decides the code: a bare app with Expo modules that calls
  // registerRootComponent registers "main" and crashes at launch (proven on device).
  const registration =
    rootRegistration.registers === 'main'
      ? {
          imports: ["import { registerRootComponent } from 'expo';"],
          call: 'registerRootComponent(StorybookUIRoot);',
        }
      : // With no index file found, the path to app.json is unknown: the name is written out.
        rootRegistration.inAppJson && storybookIndexFile
        ? {
            imports: [
              "import { AppRegistry } from 'react-native';",
              // From the index's folder to app.json in the app's folder, however deep the folder is.
              `import { name as appName } from '${importPath(path.posix.dirname(storybookIndexFile), 'app.json')}';`,
            ],
            call: 'AppRegistry.registerComponent(appName, () => StorybookUIRoot);',
          }
        : {
            imports: ["import { AppRegistry } from 'react-native';"],
            call: `AppRegistry.registerComponent('${rootRegistration.name}', () => StorybookUIRoot);`,
          };
  // WITH SCENES ON, THE REGISTRATION IS BRANCHED, as setup writes it into a start file that has one
  // (../commands/init/storybookAccess/startFileBranch): a scene launches in testing mode and needs
  // the app, so a start file registering Storybook alone cannot launch it.
  const registerRoot = (
    scenesAppEntry
      ? [
          ...registration.imports,
          modeImportLine(true),
          ...startFileBranch(registration.call, scenesAppEntry),
        ]
      : [...registration.imports, registration.call]
  ).map(renderCode);
  // THE IMPORT PATH GOES FROM THE ROOT COMPONENT'S FILE, so the line names the file setup found,
  // never a guess. With none found it names no file, and a comment says which file the path is
  // from: the most common place, so the path is right for most apps and checkable for the rest.
  const storybookImport = `import Storybook from '${storybookFolder ? importPath(path.posix.dirname(rootComponent.file), storybookFolder) : '<your Storybook folder>'}';`;
  // A WRAPPER WITH NO HOOKS BECOMES THE DEFAULT EXPORT, never an early return inside the root
  // component: a return before the root's own hooks (useColorScheme, useFonts) breaks React's rules
  // of hooks. The change named follows the export the file has, line for line; one setup could not
  // read gets the generic form, as Sherlo's docs give it (sherlo-www docs/docs/2_setup.mdx).
  const { defaultExport } = rootComponent;
  // THE APP'S PROPS PASS THROUGH: a wrapper that adds props (connect(mapState)(App)) and a bare
  // app's initialProperties reach the app as before. A TypeScript file types them `any`, the one
  // annotation that compiles under strict whatever props the app takes; `object` fails an app with
  // a required prop, and none fails noImplicitAny.
  const isTypeScript = /\.tsx?$/.test(rootComponent.file);
  const propsParameter = isTypeScript ? 'props: any' : 'props';
  const switchLines = (name: string) => [
    `function AppOrStorybook(${propsParameter}) {`,
    '  if (isStorybookMode) return <Storybook />;',
    `  return <${name} {...props} />;`,
    '}',
  ];
  const wrapperLines = switchLines(defaultExport?.name ?? 'YourApp').map(
    (line, index) => `     ${renderCode(index === 0 ? `export default ${line}` : line)}`
  );
  const rootSwapLines =
    defaultExport?.form === 'declared'
      ? [
          `   Change ${renderCode(defaultExport.line)} to:`,
          `     ${renderCode(defaultExport.rewritten)}`,
          `   At the end of ${rootComponent.file}, add:`,
          ...wrapperLines,
        ]
      : // A ONE-LINE PICK OF STORYBOOK OR THE APP is replaced whole, like a named export: the
        // wrapper now picks, and renders the app the line held.
        defaultExport?.form === 'named' || defaultExport?.form === 'ternary'
        ? [`   Replace ${renderCode(defaultExport.line)} with:`, ...wrapperLines]
        : // STORYBOOK'S OLD SWITCH GOES, and the wrapper renders the app it held: kept, the
          // switch would hand the wrapper Storybook as the app.
          defaultExport?.form === 'switched'
          ? [
              `   Remove these lines from ${rootComponent.file}:`,
              ...defaultExport.switchCode.map((line) => `     ${renderCode(line)}`),
              `   Replace ${renderCode(defaultExport.line)} with:`,
              ...wrapperLines,
            ]
          : // THE WRAPPER STAYS: the app's call (Sentry.wrap) moves onto the switch, so the app is
            // wrapped as before and Storybook with it.
            defaultExport?.form === 'wrapped'
            ? [
                `   Replace ${renderCode(defaultExport.line)} with:`,
                ...[
                  ...switchLines(defaultExport.name),
                  `export default ${defaultExport.call}(AppOrStorybook);`,
                ].map((line) => `     ${renderCode(line)}`),
              ]
            : [
                rootComponent.found
                  ? `   Couldn't tell how ${rootComponent.file} exports your root component. Make this its default export, with your root component in place of YourApp:`
                  : "   Make this your root component's file's default export, with your root component in place of YourApp:",
                ...wrapperLines,
                '   If your default export wraps your root component in a call (like Sentry.wrap), wrap AppOrStorybook in it instead.',
              ];
  // BOTH CHOICES WORK ON EVERY APP: Sherlo's build is Storybook alone either way, so an app that
  // exports its routes for the server builds it too.
  const keepSetupChoice = (removesOldRender: boolean) => [
    chalk.bold('b) In-app integration'),
    // A FOLDER WITH NO START FILE gets the file the import below loads, as a missing Storybook
    // folder gets it (./initFixes storybookFolderFiles): without it the import cannot resolve.
    ...(storybookIndexFile && !hasStartFile
      ? [
          `   Create ${storybookIndexFile}:`,
          ...renderStorybookIndexFile().map((line) => (line ? `     ${line}` : '')),
        ]
      : []),
    // THE OLD WAY GOES FIRST: left in, it renders Storybook where the wrapper expects the app. Its
    // lines are named when setup read them (the `switched` and `ternary` exports), else said in
    // words.
    ...(removesOldRender && defaultExport?.form === 'ternary'
      ? [
          `   First remove this line from ${rootComponent.file}:`,
          `     ${renderCode(defaultExport.storybookImport)}`,
        ]
      : removesOldRender && defaultExport?.form !== 'switched'
        ? ["   First remove your app's code that renders Storybook, and its import."]
        : []),
    // THE IMPORTS AT THE FILE'S TOP, THE WRAPPER AS ITS DEFAULT EXPORT: each place named, so the
    // code works when followed word for word.
    rootComponent.found
      ? `   At the top of ${rootComponent.file}, add:`
      : "   At the top of your root component's file, add:",
    `     ${renderCode("import { isStorybookMode } from '@sherlo/react-native-storybook';")}`,
    `     ${renderCode(rootComponent.found || !storybookFolder ? storybookImport : `${storybookImport} // path from ${rootComponent.file}`)}`,
    ...rootSwapLines,
  ];
  // EACH CHOICE IS A BLOCK: its name bold and alone on its line, a blank line between the two, so
  // the eye finds a) and b) before reading either. NO UPGRADE ON ANY SUPPORTED VERSION: Sherlo's
  // withStorybook does the swap, so the registration opens Storybook on 9.0 as on 10 (proven on
  // device, Expo and bare).
  const defaultSetupChoice = (removesOldRender: boolean) => [
    // WHY RECOMMENDED, IN TWO WORDS: it is what a new Storybook sets up.
    chalk.bold("a) Entry-point swapping (Storybook's default, recommended)"),
    // A FOLDER WITH NO START FILE gets the whole file, as setup would write it (registered under
    // Storybook mode with scenes on), never an addition to a file that isn't there.
    ...(storybookIndexFile && !hasStartFile
      ? [
          `   Create ${storybookIndexFile}:`,
          ...wholeStartFile(registration.imports, registration.call, scenesAppEntry).map((line) =>
            line ? `     ${renderCode(line)}` : ''
          ),
        ]
      : [
          `   In ${storybookIndexFile ?? "your Storybook folder's index file"}, below StorybookUIRoot, add:`,
          ...registerRoot.map((line) => `     ${line}`),
        ]),
    // A ONE-LINE PICK OF STORYBOOK OR THE APP is named line for line: the export becomes the app's
    // alone, and Storybook's import goes with it.
    ...(removesOldRender && defaultExport?.form === 'ternary'
      ? [
          `   Then in ${rootComponent.file}, remove:`,
          `     ${renderCode(defaultExport.storybookImport)}`,
          '   And change:',
          `     ${renderCode(defaultExport.line)}`,
          '   to:',
          `     ${renderCode(`export default ${defaultExport.name};`)}`,
        ]
      : removesOldRender
        ? ["   Then remove your app's code that renders Storybook, and its import."]
        : []),
  ];
  // THE SAME TWO CHOICES whether or not the app starts Storybook; only the reason Sherlo can't open
  // it alone differs, and code to remove exists only where an app file was seen importing the
  // Storybook folder (../commands/init/steps/storybookSetup).
  const openStorybookStep = (
    reason: string,
    { removesOldRender }: { removesOldRender: boolean }
  ) => ({
    title: 'Let Sherlo open Storybook',
    content: [
      `${reason} Pick one:`,
      '',
      ...defaultSetupChoice(removesOldRender),
      '',
      ...keepSetupChoice(removesOldRender),
    ],
  });
  // Just installed, or installed before and never started from the app: the same words.
  const notStartedStep = openStorybookStep(
    "Storybook is installed, but your app doesn't start it yet, so Sherlo can't open it.",
    { removesOldRender: false }
  );
  const oldSetupStep = openStorybookStep(
    "Storybook starts from your app's code, so Sherlo can't open it alone.",
    { removesOldRender: true }
  );

  // HOW TO WRITE A STORY, said once for every step that asks for stories.
  const writeStoriesLines = [
    'You can start with a few components or screens, one story per state:',
    // ONE STORY FILE, TWO STATES, so it is on the screen whole; the rest of the how -
    // providers, steady screenshots, Sherlo's parameters - is in the guide the SDK ships. THE FILE
    // IN THE APP'S OWN LANGUAGE: a JavaScript app's story is named like its root component's file
    // (App.js, Button.stories.js), and the snippet holds no TypeScript-only syntax either way.
    `  ${renderCode(`// Button.stories${isTypeScript ? '.tsx' : path.posix.extname(rootComponent.file)}`)}`,
    `  ${renderCode("import { Button } from './Button';")}`,
    `  ${renderCode('export default { component: Button };')}`,
    // EACH LABEL NAMES ITS STATE, so a screenshot says what it shows.
    `  ${renderCode("export const Default = { args: { title: 'Default' } };")}`,
    `  ${renderCode("export const Disabled = { args: { title: 'Disabled', disabled: true } };")}`,
    '',
    // AN INSTRUCTION, NOT A TOPIC: "How to write stories" read as basics the snippet covers.
    'Before you write stories, read:',
    `  ${chalk.cyan(WRITING_STORIES_GUIDE)}`,
  ];

  // EVERY STEP IS A TITLE AND ITS CONTENT: a bold line saying what, then indented lines in plain
  // weight, nothing dimmed, so a recommendation reads as clearly as the step it sits in.
  const replaceExampleStoriesStep = {
    title: 'Replace the example stories',
    // WHERE STORYBOOK LOOKS: an agent told to write "your components' stories" writes them where
    // Storybook never loads them.
    // A STORY THE LIST LEAVES OUT IS NAMED, with the exact list that loads its folder in the form
    // Storybook's own template writes: the app has stories already, so nothing about writing one.
    content:
      leftOutStory && storybookMainFile && storybookFolder
        ? [
            "Right now Sherlo would test Storybook's examples, not your app.",
            `Your story ${leftOutStory} isn't in "stories" in ${storybookMainFile}, so Storybook never loads it.`,
            `Set "stories" to ${renderCode(`[${storiesGlob({ storybookFolder, storiesFolder: path.posix.dirname(leftOutStory) })}]`)}.`,
          ]
        : [
            // WHY FIRST, THEN A SMALL START: the examples must go because Sherlo would test them, and
            // a few components are enough to begin, so the step never reads as a big job.
            "Right now Sherlo would test Storybook's examples, not your app.",
            // A FOLDER, NOT A PATTERN: Storybook finds every story file under it, and the examples
            // outside it drop out, so they need no deleting. The folder is one the app has; the
            // app's folder itself is a pattern without subfolders, which never reaches node_modules.
            storybookMainFile && storybookFolder
              ? `Set "stories" in ${storybookMainFile} to ${renderCode(`[${storiesFolder === '.' ? storiesGlob({ storybookFolder, storiesFolder }) : `'${importPath(storybookFolder, storiesFolder)}'`}]`)}.`
              : `Set "stories" in your Storybook folder's main file to your code's folder.`,
            // A BLANK LINE BETWEEN PARTS - what to change, an example, where to read more - so each is
            // found without reading the others.
            '',
            ...writeStoriesLines,
          ],
  };

  // THE FIRST TEST COMES LAST, after the app's own stories, so it never photographs Storybook's
  // examples - and it is still listed, so an agent that wrote the stories knows what runs next.
  // ONE BRANCH PER STATE, never a lookup table, so the render reach test sees which states a pose
  // drew: V8 counts each case, label included, so a state no pose drew is named by its label.
  const storybookSteps = (function storybookStepsOf(): Array<{
    title: string;
    content: string[];
  }> {
    switch (storybook) {
      case 'installed':
        return [notStartedStep, replaceExampleStoriesStep];
      case 'default-setup':
        return [];
      // The app's Storybook is the person's own and already opens, but the stories are still
      // Storybook's examples.
      case 'example-stories':
        return [replaceExampleStoriesStep];
      case 'old-setup':
        return [oldSetupStep];
      case 'old-setup-example-stories':
        return [oldSetupStep, replaceExampleStoriesStep];
      case 'not-started':
        return [notStartedStep];
      case 'not-started-example-stories':
        return [notStartedStep, replaceExampleStoriesStep];
    }
  })();

  // A STORY LIST SETUP COULD NOT READ IS A STEP OF ITS OWN, right before the first test, which would
  // fail on it too. A story list is only unreadable in a folder setup found, so the folder is named.
  // A main file that is there is named with its error; a missing one is written whole, in the form
  // Storybook's own template writes, its `stories` loading the folder of the app's story, or a
  // folder the app has when it has none yet - and then writing a story is a step of its own.
  const fixStoryListStep = !storyListUnreadable
    ? []
    : storyListUnreadable === 'main-file-missing'
      ? storybookFolder
        ? [
            {
              title: `Add ${storybookFolder}/main.ts`,
              content: [
                `${storybookFolder} has no main file, which lists your stories. Add ${storybookFolder}/main.ts:`,
                ...renderStorybookMainFile({ storybookFolder, storiesFolder }).map((line) =>
                  line === '' ? '' : `  ${line}`
                ),
              ],
            },
            ...(leftOutStory
              ? []
              : [
                  {
                    title: 'Write your first stories',
                    content: [
                      `Your app has no stories yet. Write them in ${storiesFolder === '.' ? "your app's folder itself" : storiesFolder}, where main.ts looks.`,
                      '',
                      ...writeStoriesLines,
                    ],
                  },
                ]),
          ]
        : []
      : [
          {
            title: `Fix ${storybookMainFile}`,
            content: [
              `Couldn't load ${storybookMainFile} to see which stories it lists: ${storyListUnreadable.loadError}`,
            ],
          },
        ];

  const steps = [
    ...storybookSteps,
    ...fixStoryListStep,
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
