/**
 * WHAT `sherlo init` PRINTS WHEN IT STOPS: the one red line saying what is wrong, then everything
 * needed to fix it, in the output itself.
 *
 * EVERY FIX IS COMPLETE ON THE SCREEN: agents often do not open a link, so a
 * refusal never leans on the docs. It names the exact command, the exact file and the exact lines,
 * and ends on the command that carries on. When a fix is a real choice - an upgrade that changes the
 * whole app, which account to use - the options are lettered and the recommended one comes first.
 *
 * AS SHORT AS STILL WORKS: every line is a command, a file, or the one fact needed to act. A reason,
 * a reassurance or a second way of saying it is cut.
 *
 * Pure, like everything under ./: state in, the `message` and `below` that `throwError` prints.
 */
import chalk from 'chalk';

export type InitRefusal = { message: string; below: string };

const INIT_COMMAND = 'npx sherlo init';

/** A command or code, indented and in the command colour. */
const code = (line: string): string => chalk.cyan(`  ${line}`);

/** Plain words: `throwError` prints only the first line red, and these reset any colour above. */
const words = (line: string): string => chalk.reset(line);

/** The closing lines of every refusal: what to run once it is fixed. */
function rerun(): string[] {
  return ['', words('Then run setup again:'), code(INIT_COMMAND)];
}

function refusal(message: string, below: string[]): InitRefusal {
  return { message, below: ['', ...below].join('\n') };
}

/** Where setup runs, for every refusal that is about the folder. */
function goToTheApp(): string[] {
  return [
    words("Run setup in your React Native app's folder:"),
    code('cd <your app folder>'),
    code(INIT_COMMAND),
  ];
}

/** The folder has no package.json at all. */
export function renderNotInAnApp({ folder }: { folder: string }): InitRefusal {
  return refusal(`No package.json in ${folder}`, goToTheApp());
}

/**
 * The folder is a monorepo's root. `appFolders` are the workspaces that list react-native, relative
 * to the root, so the fix names the very folder to go to.
 */
export function renderMonorepoRoot({ appFolders }: { appFolders: string[] }): InitRefusal {
  const goTo =
    appFolders.length === 1
      ? [words("Run setup in the app's folder:"), code(`cd ${appFolders[0]}`), code(INIT_COMMAND)]
      : appFolders.length > 1
        ? [
            words('Run setup in one of these app folders:'),
            ...appFolders.map((folder) => code(folder)),
            '',
            code(`cd ${appFolders[0]}`),
            code(INIT_COMMAND),
          ]
        : goToTheApp();

  return refusal("This is a monorepo's root", goTo);
}

/** package.json does not list react-native. */
export function renderNoReactNative(): InitRefusal {
  return refusal('package.json does not list react-native', goToTheApp());
}

/**
 * A package package.json lists is not in node_modules: the dependencies were never installed.
 * `installCommand` is the project's own package manager's, e.g. `yarn install`.
 */
export function renderPackagesNotInstalled({
  packageName,
  installCommand,
}: {
  packageName: string;
  installCommand: string;
}): InitRefusal {
  return refusal(`${packageName} is not installed`, [
    words('Install dependencies:'),
    code(installCommand),
    ...rerun(),
  ]);
}

/**
 * React Native is older than Sherlo supports. An upgrade changes the whole app, so the person
 * decides it; the commands are Expo's and React Native's own.
 */
export function renderReactNativeTooOld({
  current,
  min,
  isExpo,
  addReactNativeCommand,
}: {
  current: string;
  min: string;
  isExpo: boolean;
  /** The project's package manager adding the oldest supported React Native, e.g. `yarn add react-native@0.81.0`. */
  addReactNativeCommand: string;
}): InitRefusal {
  return refusal(`React Native ${current} is too old: Sherlo needs ${min} or newer`, [
    words('Upgrading changes the whole app, so ask first.'),
    ...(isExpo
      ? [
          words('Upgrade Expo:'),
          code('npx expo install expo@latest'),
          code('npx expo install --fix'),
        ]
      : [
          words("Make the native changes React Native's Upgrade Helper lists, then:"),
          code(addReactNativeCommand),
        ]),
    ...rerun(),
  ]);
}

/**
 * Storybook is older than Sherlo supports. Two ways out: upgrade it, or let setup install the
 * newest one.
 */
export function renderStorybookTooOld({
  current,
  min,
  installCommand,
}: {
  current: string;
  min: string;
  /** The project's package manager adding the newest Storybook, e.g. `yarn add @storybook/react-native@latest`. */
  installCommand: string;
}): InitRefusal {
  return refusal(`Storybook ${current} is too old: Sherlo needs ${min} or newer`, [
    words('a) Upgrade every @storybook/* package to the same version (recommended):'),
    code(installCommand),
    words('b) Or remove every @storybook/* package and the .storybook or .rnstorybook'),
    words('   folder: setup installs the newest.'),
    ...rerun(),
  ]);
}

/**
 * The Metro config's export is not a call setup can wrap, so the one edit is the person's: the
 * lines are shown whole, for a CommonJS and an ES module config.
 */
export function renderMetroConfigUnreadable({ path }: { path: string }): InitRefusal {
  return refusal(`Setup cannot edit ${path}`, [
    words("Wrap its export in Sherlo's withStorybook:"),
    code("const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');"),
    code('module.exports = withStorybook(config);'),
    words('In an ES module:'),
    code("import withStorybook from '@sherlo/react-native-storybook/metro/withStorybook';"),
    code('export default withStorybook(config);'),
    words("Sherlo's replaces Storybook's own withStorybook: never use both."),
    ...rerun(),
  ]);
}

/**
 * The person is signed in but cannot reach the project the config or `--project` names: a teammate
 * cloned a repo whose team has not invited them, or they signed in with another account.
 */
export function renderNoAccessToProject({
  project,
  email,
  namedIn,
}: {
  /** `teamId/projectIndex`. */
  project: string;
  /** The account this computer is signed in with. */
  email: string;
  namedIn: 'config' | 'flag';
}): InitRefusal {
  return refusal(`${email} has no access to project ${project}`, [
    words('a) Ask the team for an invitation link (web app, Users, "Copy invitation link"),'),
    words(`   open it as ${email}, then:`),
    code(INIT_COMMAND),
    words('b) Wrong account? Sign out and run setup again:'),
    code('npx sherlo logout'),
    code(INIT_COMMAND),
    ...(namedIn === 'config'
      ? [
          words('c) Or make your own project: delete "project" from sherlo.config.json, then:'),
          code(INIT_COMMAND),
        ]
      : []),
  ]);
}

/**
 * `create-storybook` failed. `failedOutput` is the installer's own last lines, as the SDK install's
 * refusal shows them; the command is shown so it can be run alone.
 */
export function renderStorybookInstallFailed({
  command,
  failedOutput,
}: {
  command: string;
  /** Undefined when the installer printed nothing. */
  failedOutput: string | undefined;
}): InitRefusal {
  return refusal('Storybook could not be installed', [
    ...(failedOutput ? [failedOutput, ''] : []),
    words('Fix the error. To see all of it, run:'),
    code(command),
    ...rerun(),
  ]);
}

/** A JSON file setup reads is not valid JSON; `reason` is the parser's own "line 12 column 3". */
export function renderInvalidJson({ path, reason }: { path: string; reason: string }): InitRefusal {
  return refusal(`${path} is not valid JSON`, [words(reason), ...rerun()]);
}

/** Sherlo's servers could not be reached; `cause` is the network's own code and host. */
export function renderServiceUnreachable({ cause }: { cause: string }): InitRefusal {
  return refusal('Setup could not reach Sherlo', [
    words(cause),
    words('Check this computer can open https://api.sherlo.io.'),
    ...rerun(),
  ]);
}
