/**
 * WHAT `sherlo init` PRINTS WHEN IT STOPS: the one red line saying what is wrong, then everything
 * needed to fix it, in the output itself.
 *
 * EVERY FIX IS COMPLETE ON THE SCREEN: agents often do not open a link, so a
 * refusal never leans on the docs. It names the exact command, the exact file and the exact lines,
 * and ends on the command that carries on. When a fix is a real choice - an upgrade that changes the
 * whole app, which account to use - the options are lettered and the recommended one comes first.
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
  return ['', words('Then run setup again - it picks up where it stopped:'), code(INIT_COMMAND)];
}

function refusal(message: string, below: string[]): InitRefusal {
  return { message, below: ['', ...below].join('\n') };
}

/** The folder has no package.json at all. */
export function renderNotInAnApp({ folder }: { folder: string }): InitRefusal {
  return refusal(`There is no package.json in ${folder}, so this is not an app's folder`, [
    words("Setup runs in your React Native app's folder: the one whose package.json lists"),
    words('react-native. Go to that folder and run setup there:'),
    code('cd <your app folder>'),
    code(INIT_COMMAND),
  ]);
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
            words('Run setup in the folder of the app to test - these list react-native:'),
            ...appFolders.map((folder) => code(folder)),
            '',
            words('For example:'),
            code(`cd ${appFolders[0]}`),
            code(INIT_COMMAND),
          ]
        : [
            words('Run setup in the folder of the app to test, the one whose package.json lists'),
            words('react-native:'),
            code('cd <your app folder>'),
            code(INIT_COMMAND),
          ];

  return refusal("This is a monorepo's root, and setup runs inside one app", goTo);
}

/** package.json does not list react-native. */
export function renderNoReactNative(): InitRefusal {
  return refusal('This package.json does not list react-native', [
    words("Sherlo tests React Native apps, and setup runs in the app's own folder."),
    words('If the app is in another folder, go there and run setup:'),
    code('cd <your app folder>'),
    code(INIT_COMMAND),
  ]);
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
  return refusal(`${packageName} is listed in package.json but not installed`, [
    words("The app's dependencies are not installed yet. Install them:"),
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
  return refusal(`React Native ${current} is older than ${min}, the oldest Sherlo supports`, [
    words('Upgrading React Native changes the whole app, so check with the person first.'),
    ...(isExpo
      ? [
          words(`Expo SDK 54 and newer ship React Native ${min} or newer. To upgrade Expo:`),
          code('npx expo install expo@latest'),
          code('npx expo install --fix'),
        ]
      : [
          words(`A bare app's upgrade also changes native files. React Native's Upgrade Helper`),
          words(`lists every change from ${current} to ${min}; then install the new version:`),
          code(addReactNativeCommand),
        ]),
    words('Build and run the app once to check it still works.'),
    ...rerun(),
  ]);
}

/**
 * Storybook is older than Sherlo supports. Two ways out: upgrade it, or let setup install the
 * newest one - its stories stay where they are.
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
  return refusal(`Storybook ${current} is older than ${min}, the oldest Sherlo supports`, [
    words('Pick one:'),
    words('a) Upgrade Storybook (recommended):'),
    code(installCommand),
    words('   and upgrade every other @storybook/* package in package.json to the same version.'),
    words('b) Let setup install the newest Storybook: remove every @storybook/* package from'),
    words('   package.json, delete the .storybook or .rnstorybook folder, and reinstall.'),
    words('   Your stories stay in their files; list their folders in .rnstorybook/main.ts.'),
    ...rerun(),
  ]);
}

/**
 * The Metro config's export is not a call setup can wrap, so the one edit is the person's: the
 * lines are shown whole, for a CommonJS and an ES module config.
 */
export function renderMetroConfigUnreadable({ path }: { path: string }): InitRefusal {
  return refusal(`Setup cannot edit ${path}: its export is not a shape setup can read`, [
    words("Wrap the config it exports in Sherlo's withStorybook. Add at the top:"),
    code("const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');"),
    words('and wrap the export:'),
    code('module.exports = withStorybook(config);'),
    '',
    words('In an ES module config, the same two lines are:'),
    code("import withStorybook from '@sherlo/react-native-storybook/metro/withStorybook';"),
    code('export default withStorybook(config);'),
    '',
    words("If it already uses Storybook's own withStorybook, replace that require with Sherlo's:"),
    words("Sherlo's includes Storybook's, so never wrap one in the other."),
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
  const where =
    namedIn === 'config'
      ? 'sherlo.config.json names it in "project".'
      : 'The --project option names it.';

  return refusal(`${email} has no access to the project ${project}`, [
    words(where),
    words('Pick one:'),
    words('a) Ask someone in the team that owns it for an invitation link - "Copy invitation'),
    words(`   link" on the Users page of the Sherlo web app. Open it signed in as ${email},`),
    words('   then run setup again:'),
    code(INIT_COMMAND),
    words('b) Signed in with the wrong account? Sign out, and setup signs you in again:'),
    code('npx sherlo logout'),
    code(INIT_COMMAND),
    ...(namedIn === 'config'
      ? [
          words(
            'c) Use a new project of your own: delete the "project" line from sherlo.config.json'
          ),
          words('   and run setup again - it makes one:'),
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
    words("To see the installer's whole output, run it yourself:"),
    code(command),
    words('Fix what it reports - most often a dependency conflict in package.json.'),
    ...rerun(),
  ]);
}

/** A JSON file setup reads is not valid JSON; `where` is the parser's own "line 12 column 3". */
export function renderInvalidJson({ path, reason }: { path: string; reason: string }): InitRefusal {
  return refusal(`${path} is not valid JSON`, [words(reason), words('Fix that line.'), ...rerun()]);
}

/** Sherlo's servers could not be reached; `cause` is the network's own code and host. */
export function renderServiceUnreachable({ cause }: { cause: string }): InitRefusal {
  return refusal('Setup could not reach Sherlo', [
    words(cause),
    words('Check this computer is online and can open https://api.sherlo.io.'),
    ...rerun(),
  ]);
}
