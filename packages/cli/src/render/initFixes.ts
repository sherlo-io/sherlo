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
import { LOGIN_COMMAND } from '../commands/login/constants';
import {
  REJECTED_LOGIN_REASONS,
  REJECTED_LOGIN_SENTENCE,
} from '../commands/shared/refuseRejectedLogin';
import { renderCode } from './initLines';
import type { FeedbackReader } from './initSteps';

export type InitRefusal = { message: string; below: string };

const INIT_COMMAND = 'npx sherlo init';

/** A command, indented and in the command colour; code to add goes through `renderCode`. */
const code = (line: string): string => chalk.cyan(`  ${line}`);

/** Plain words: `throwError` prints only the first line red, and these reset any colour above. */
const words = (line: string): string => chalk.reset(line);

/**
 * The name of one way out when a refusal offers two: bold and alone on its line, a blank line
 * between the two, so the eye finds a) and b) before reading either - as the next steps do.
 */
const choiceName = (name: string): string => chalk.bold(name);

/**
 * The closing lines of a refusal whose fix is words, not commands: what to run once it is fixed.
 * They say the rerun picks up where it stopped, so nobody undoes the steps already done first.
 */
function rerun(): string[] {
  return ['', words('Then run setup again. It picks up where it stopped:'), code(INIT_COMMAND)];
}

function refusal(message: string, below: string[]): InitRefusal {
  return { message, below: ['', ...below].join('\n') };
}

/** Where setup runs, for every refusal that is about the folder. */
function goTo(folderWords: string, folder: string): string[] {
  return [
    words(`Go to ${folderWords} and run setup again:`),
    code(`cd ${folder}`),
    code(INIT_COMMAND),
  ];
}

/** The folder has no package.json at all. */
export function renderNotInAnApp({ folder }: { folder: string }): InitRefusal {
  return refusal(`No package.json in ${folder}`, goTo("your app's folder", '<your app folder>'));
}

/**
 * The folder is a monorepo's root. `appFolders` are the workspaces that hold an app - react-native
 * in their dependencies and an app.json, or both native folders - relative to the root, so the fix
 * names the very folder to go to.
 */
export function renderMonorepoRoot({ appFolders }: { appFolders: string[] }): InitRefusal {
  const fix =
    appFolders.length === 1
      ? goTo("the app's folder", appFolders[0])
      : appFolders.length > 1
        ? [
            words('Apps found:'),
            ...appFolders.map((folder) => code(folder)),
            '',
            words('Go to the one to test and run setup again:'),
            // A placeholder, not the first app: a real folder here reads as setup's own pick.
            code('cd <your app folder>'),
            code(INIT_COMMAND),
          ]
        : goTo("your app's folder", '<your app folder>');

  return refusal('This folder is a monorepo root', fix);
}

/** package.json does not list react-native. */
export function renderNoReactNative(): InitRefusal {
  return refusal(
    "package.json doesn't list react-native",
    goTo("your React Native app's folder", '<your app folder>')
  );
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
  return refusal(`${packageName} isn't installed`, [
    words('Install your dependencies, then run setup again:'),
    code(installCommand),
    code(INIT_COMMAND),
  ]);
}

/**
 * React Native is older than Sherlo supports. An upgrade changes the whole app, so the person
 * decides it: an agent reads one more line saying it upgrades only with the user's OK. The commands
 * are Expo's and React Native's own.
 */
export function renderReactNativeTooOld({
  current,
  min,
  isExpo,
  addReactNativeCommand,
  reader = 'person',
}: {
  current: string;
  min: string;
  isExpo: boolean;
  /** The project's package manager adding the oldest supported React Native, e.g. `yarn add react-native@0.81.0`. */
  addReactNativeCommand: string;
  reader?: FeedbackReader;
}): InitRefusal {
  return refusal(`React Native ${current} is too old: Sherlo needs ${min} or newer`, [
    words('Upgrading changes the whole app.'),
    ...(reader === 'agent' ? [words("AI agents upgrade it only with the user's OK.")] : []),
    '',
    ...(isExpo
      ? [
          words('Upgrade Expo, then run setup again:'),
          code('npx expo install expo@latest'),
          code('npx expo install --fix'),
          code(INIT_COMMAND),
        ]
      : [
          words("Make the native changes React Native's Upgrade Helper lists for your versions:"),
          code('https://react-native-community.github.io/upgrade-helper'),
          '',
          words('Then upgrade the package and run setup again:'),
          code(addReactNativeCommand),
          code(INIT_COMMAND),
        ]),
  ]);
}

/**
 * Storybook is older than Sherlo supports: the one way out is upgrading it. Removing it for setup
 * to install afresh is not offered, as it could delete the app's stories.
 *
 * NO UPGRADE COMMAND: one `add` moves one package, and "latest" on each does not land them on one
 * version (from 7.6.20 it gave 10.7.0 for the React Native ones and 10.6.5 for @storybook/react), so
 * the goal is named, with Storybook for React Native's own migration guide: it upgrades by hand, one
 * major version at a time, each with steps of its own (new native packages for 8, the folder rename
 * for 9), as the React Native refusal names React Native's Upgrade Helper.
 */
export function renderStorybookTooOld({
  current,
  min,
}: {
  current: string;
  min: string;
}): InitRefusal {
  return refusal(`Storybook ${current} is too old: Sherlo needs ${min} or newer`, [
    words('Upgrade Storybook, with every @storybook/* package on the same version.'),
    words("Follow Storybook for React Native's migration guide, one version at a time:"),
    code('https://github.com/storybookjs/react-native/blob/next/MIGRATION.md'),
    ...rerun(),
  ]);
}

/**
 * The Metro config's export is not a call setup can wrap, so the one edit is the person's: the
 * lines are shown whole, for a CommonJS and an ES module config.
 */
export function renderMetroConfigUnreadable({ path }: { path: string }): InitRefusal {
  return refusal(`Setup can't edit ${path}`, [
    words("Wrap its export in Sherlo's withStorybook, the way your file loads modules:"),
    '',
    choiceName('a) With require'),
    `   ${renderCode("const withStorybook = require('@sherlo/react-native-storybook/metro/withStorybook');")}`,
    `   ${renderCode('module.exports = withStorybook(config);')}`,
    '',
    choiceName('b) With import'),
    `   ${renderCode("import withStorybook from '@sherlo/react-native-storybook/metro/withStorybook';")}`,
    `   ${renderCode('export default withStorybook(config);')}`,
    '',
    words("If Storybook's own withStorybook is there, swap it for Sherlo's."),
    ...rerun(),
  ]);
}

/**
 * The person is signed in but cannot reach the project the config or `--project` names: a teammate
 * cloned a repo whose team has not invited them, or they signed in with another account. Starting a
 * project of their own is not offered: dropping the config's project could cut off a project that
 * works for the rest of the team.
 */
export function renderNoAccessToProject({
  project,
  email,
}: {
  /** `teamId/projectIndex`. */
  project: string;
  /** The account this computer is signed in with. */
  email: string;
  /** Where the project was named; the words are the same for both since the third way out went. */
  namedIn: 'config' | 'flag';
}): InitRefusal {
  return refusal(`${email} has no access to project ${project}`, [
    choiceName('a) Ask your team for access'),
    words('   They copy an invitation link in the web app (Users, "Copy invitation link").'),
    words(`   Open it signed in as ${email}.`),
    '',
    choiceName('b) Use another account'),
    words('   Log out, and log in with it when setup asks:'),
    code('   npx sherlo logout'),
    ...rerun(),
  ]);
}

/**
 * The package manager adding Sherlo failed. `failedOutput` is its own last lines; the command is
 * shown so it can be run alone, which also shows its whole output.
 */
export function renderInstallFailed({
  command,
  failedOutput,
}: {
  command: string;
  /** Undefined when the tool printed nothing. */
  failedOutput: string | undefined;
}): InitRefusal {
  return refusal("Sherlo couldn't be installed", [
    ...(failedOutput ? [failedOutput, ''] : []),
    words('Fix the error, or install Sherlo yourself:'),
    code(command),
    ...rerun(),
  ]);
}

/**
 * Storybook's installer failed, so nothing was written. `failedOutput` is the installer's own last
 * lines. No command to type but setup itself: setup runs the installer again.
 */
export function renderStorybookInstallerFailed({
  failedOutput,
}: {
  /** Undefined when the installer printed nothing. */
  failedOutput: string | undefined;
}): InitRefusal {
  return refusal("Storybook's installer failed", [
    ...(failedOutput ? [failedOutput, ''] : []),
    words('Fix the error shown above, then run setup again:'),
    code(INIT_COMMAND),
  ]);
}

/**
 * The download of Storybook's packages failed after its files and package list were written.
 * `command` is the package manager's plain install, which shows the whole error when run alone.
 */
export function renderStorybookDownloadFailed({
  command,
  failedOutput,
}: {
  command: string;
  /** Undefined when the package manager printed nothing. */
  failedOutput: string | undefined;
}): InitRefusal {
  return refusal("Storybook's packages couldn't be downloaded", [
    ...(failedOutput ? [failedOutput, ''] : []),
    words("Storybook's files are written. Download its packages yourself:"),
    code(command),
    ...rerun(),
  ]);
}

/** A JSON file setup reads is not valid JSON; `reason` is the parser's own "line 12 column 3". */
export function renderInvalidJson({ path, reason }: { path: string; reason: string }): InitRefusal {
  return refusal(`${path} isn't valid JSON`, [
    words(reason),
    '',
    words('Fix the file, then run setup again:'),
    code(INIT_COMMAND),
  ]);
}

/**
 * A browser login that ended without a token (canceled, expired, collected by another run). The
 * `sentence` is the login's own, said once; the fix is the whole setup again, which starts a new one.
 */
export function renderLoginNotFinished({ sentence }: { sentence: string }): InitRefusal {
  return refusal(sentence, [words('Run setup again:'), code(INIT_COMMAND)]);
}

/**
 * The service no longer accepts the login saved on this computer. The sentences are
 * `refuseRejectedLogin`'s own; the fix is to log in again, then run setup again.
 */
export function renderLoginRejected(): InitRefusal {
  return refusal(REJECTED_LOGIN_SENTENCE, [
    words(REJECTED_LOGIN_REASONS),
    '',
    words('Log in again:'),
    code(`npx sherlo ${LOGIN_COMMAND}`),
    ...rerun(),
  ]);
}

/**
 * Sherlo's servers could not be reached. `host` is the address that failed and `code` the network's
 * own code, both from the real error; ONE LINE says what failed where, with no brackets when there
 * is no code.
 *
 * WHAT TO CHECK, NOT AN ADDRESS TO OPEN: the API answers a browser with an error page even when it
 * is up, so opening it tells nobody whether it works.
 */
export function renderServiceUnreachable({
  host,
  code,
}: {
  host?: string;
  code?: string;
}): InitRefusal {
  const where = host ? ` at ${host}` : '';
  const why = code ? ` (${chalk.dim(code)})` : '';
  return refusal(`Setup couldn't reach Sherlo${where}${why}.`, [
    words('Check your internet connection, and that no VPN, proxy or firewall blocks it.'),
    ...rerun(),
  ]);
}
