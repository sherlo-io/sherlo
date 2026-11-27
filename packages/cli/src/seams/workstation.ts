/**
 * THE WORKSTATION SEAM - the things `sherlo init` does TO this machine rather than reads off it.
 *
 *     live   - the package manager and `pod install`, run inside the project; the person at the
 *              keyboard, and the key they press.
 *     posed  - the pose's `workstation`: the package the manager answered with, whether the pods
 *              installed, and whether anybody was there to press Enter.
 *
 * `sherlo init` is the one command that ACTS on the machine. It runs the package manager to add
 * Sherlo, runs `pod install` when the project has an iOS Podfile, and stops at a prompt until
 * somebody presses Enter. None of these exists on a machine that only has the pose - there is no
 * registry to install from, no CocoaPods, and no keyboard to press - so all of them are here,
 * behind one answer, and the shipped code around them runs unforked: the spinners, the beep, the
 * prompt's own words, the erase, the cancel branch, every printed line.
 *
 * THE POSED HALF NEVER PRINTS, and that is the boundary. The prompt's bytes belong to
 * ../commands/init/helpers/waitForEnterPress, which still writes them itself; what a pose answers
 * is only whether there is somebody to ask and what they did. A pose that could put a byte on the
 * screen would be supplying words, and a pose may never supply a word.
 *
 * WHAT IS NOT HERE. The progress init reports rides ../seams/serverCalls (the pose's `api`
 * `trackCliInit`). WHICH package manager the project uses is no act: it is read from its files.
 *
 * ------------------------------------------------------------------------
 * WHY AN UNANSWERED INSTALL IS RECORDED AND NOT THROWN.
 *
 * The tool turns a failed install into its own refusal - "Failed to install Sherlo automatically",
 * or "Failed to install Pods automatically" - and ends the run there. A posed install that threw
 * would therefore replace the screen the pose exists to show with the tool's install-failure
 * screen, and whoever read it would be looking at a product state the pose never described. So the
 * refusal is RECORDED, the run carries on, and the refusal block printed under the screen - with
 * exit 1 - is what says the pose owed an answer. It is the same reason ../seams/serverCalls
 * records rather than only throws.
 *
 * THE PROMPT IS THE OTHER WAY ROUND. A pose with no `workstation` is a terminal nobody sits at, so
 * the question "is somebody there" THROWS its refusal, and the tool's own cancel branch prints
 * "Setup cancelled" - which is what a real run whose terminal went away gets. The same branch is
 * what a pose stating `enter: "closed"` is asking to see.
 *
 * THE QUESTIONS SETUP ASKS - which team, which project, a new one's name - are the person at the
 * keyboard too, so they are here: the live half asks them through `@inquirer/prompts`. A pose has
 * no way to state an answer, so the posed half refuses every question and the setup is cancelled;
 * a test that needs an answer installs a workstation of its own.
 */
import { execFile } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { confirm, input, select } from '@inquirer/prompts';
import ansiEscapes from 'ansi-escapes';
import { runningAgent } from '../commands/feedback/runningAgent';
import { packageNameOfSpecifier } from '../commands/test/lockfilePackages';
import { version as cliVersion } from '../../package.json';
import { installedPodsAreCurrent } from '../helpers/installedPods';
import runShellCommand from '../helpers/runShellCommand';
import { parseConfigProject } from '../helpers/getValidatedCommandParams/validateCommandParams/resolvePushCredential';
import { decideScenesForProject, rememberedScenesFlag } from '../helpers/scenesFlag';
import type { TeamFeatureFlags } from '../render/teamList';
import type { PosedFiles } from './projectFiles';
import { serverCalls } from './serverCalls';

/** Every act `sherlo init` performs on the machine it runs on, and nothing else. */
export type Workstation = {
  /**
   * The version of the Sherlo CLI running setup, e.g. `3.0.1`: the SDK setup asks for is read off
   * it. A pose names it to draw a release (a release-day install, a major not on the registry yet)
   * while the tool itself is a prerelease.
   */
  sherloVersion(): string;

  /** Add one package to the project through its package manager. */
  addPackage(params: {
    /** The package the command asked for, e.g. `@sherlo/react-native-storybook`. */
    packageSpec: string;
    /** The whole command line, e.g. `yarn add -D @sherlo/react-native-storybook`. */
    command: string;
    projectRoot: string;
    env?: NodeJS.ProcessEnv;
  }): Promise<void>;

  /**
   * Set Storybook's lite setup up in a project that has none: install its packages, and write its
   * config folder, its example stories and its Metro wrapper into the project. Answers whether it
   * wrote pnpm's `allowBuilds` answer for esbuild into `pnpmSettingsFile`, without which pnpm
   * stops the install, so the checklist can say the person's pnpm settings changed.
   */
  installStorybook(params: {
    /** The whole command line, e.g. `yarn add @storybook/react-native@10.7.2 ...`. */
    command: string;
    projectRoot: string;
    /**
     * The `pnpm-workspace.yaml` pnpm reads its settings from: the workspace root's in a pnpm
     * monorepo, else the project's own. pnpm never reads one in an app folder of a workspace.
     */
    pnpmSettingsFile: string;
  }): Promise<{ updatedPnpmSettings: boolean }>;

  /** Run `pod install` in the project's iOS folder. */
  installPods(params: {
    /** The whole command line, e.g. `cd ios && pod install`. */
    command: string;
    projectRoot: string;
    /**
     * Whether the command runs with SHERLO_BUILD unset, which links Sherlo into
     * the app target's debug-mapped configurations only.
     */
    sherloBuildUnset?: boolean;
  }): Promise<void>;

  /**
   * Whether the project's installed pods already match its Podfile.lock and link Sherlo into a
   * configuration, so `pod install` would change nothing that matters and is skipped.
   */
  podsAreCurrent(iosFolder: string): boolean;

  /** What the service said about the team of the chosen project; undefined, which is off, if unasked. */
  scenesFlag(): 'on' | 'off' | undefined;
  /** What the service said about agent skills for that team; undefined, which is off, if unasked. */
  agentSkillsFlag(): 'on' | 'off' | undefined;
  /** Ask the service about that team and keep the answer for `scenesFlag()`; a pose asks nothing. */
  askScenesFlag(configProject: unknown): Promise<void>;
  /**
   * Settle setup's team flags, kept for `scenesFlag()` and `agentSkillsFlag()`: `listedFlags` when
   * setup listed the teams, so nothing is asked twice; with none, the service is asked about the
   * team of `configProject` with `personalToken`, the login setup found the project with. A failed
   * call rejects, so setup refuses it rather than read the flags as off. A pose answers from its
   * `api`, as a real run is answered.
   */
  settleTeamFlags(
    configProject: string,
    listedFlags: TeamFeatureFlags | undefined,
    personalToken: string
  ): Promise<void>;

  /** Run one git command line in the project folder; rejects when git fails (not a git folder). */
  readGit(params: { command: string; projectRoot: string }): Promise<string>;

  /**
   * The real host behind an SSH host name, as this machine's SSH config maps it: `ssh -G <host>`
   * prints the configuration after its Host and Match blocks, and its `hostname` line is the answer
   * (`github-work` -> `github.com`). Null when ssh is missing or fails.
   */
  readSshHostName(host: string): Promise<string | null>;

  /**
   * How long modern Yarn holds a new version back, in minutes: `yarn config get npmMinimalAgeGate`
   * in the project folder prints the setting parsed to its unit, minutes (Yarn's plugin-npm
   * declares it a DURATION in MINUTES, default `1d`, so 1440). Null when Yarn cannot answer.
   */
  readYarnAgeGateMinutes(projectRoot: string): Promise<number | null>;

  /** The version `pnpm --version` prints in this folder, null when pnpm cannot answer. */
  readPnpmVersion(folder: string): Promise<string | null>;

  /**
   * Storybook's own loader (`storybook/internal/common`) as the app has it installed: setup reads
   * the app's story list through it, so a story file counts only where Storybook itself would load
   * it. Throws when the app has no `storybook` package.
   */
  storybookLoader(projectRoot: string): StorybookLoader;

  /** Whether there is a person at the keyboard who could answer a prompt at all. */
  somebodyIsAtTheKeyboard(): boolean;

  /**
   * Take the keyboard, then call `showPrompt`, then wait for the key they press: Enter resolves, a
   * kill key rejects and the setup is cancelled. The prompt is shown only after the keyboard is
   * taken, so a key pressed the moment it appears is not echoed.
   */
  readEnterPress(showPrompt: () => void): Promise<void>;

  /** Ask the person to pick one of the choices, and answer the value of the one they picked. */
  chooseOne<Value>(params: {
    question: string;
    choices: { name: string; value: Value }[];
  }): Promise<Value>;

  /** Ask the person to type an answer, and answer what they typed. */
  askForText(params: { question: string }): Promise<string>;

  /** Ask the person a yes or no question, and answer whether they said yes. */
  askYesOrNo(params: { question: string }): Promise<boolean>;
};

/**
 * The two parts of `storybook/internal/common` setup calls: the app's main config, loaded the way
 * Storybook loads it, and its `stories` turned into the matchers Storybook tests a file against
 * (a file's path from the app folder, written `./src/Button.stories.tsx`).
 */
export type StorybookLoader = {
  loadMainConfig(options: { configDir: string; cwd: string }): Promise<{ stories?: unknown }>;
  normalizeStories(
    stories: unknown,
    options: { configDir: string; workingDir: string }
  ): { importPathMatcher: RegExp }[];
};

/**
 * What a failed package install throws, live or posed: everything the package manager printed,
 * and setup's own log file that holds it.
 */
export type InstallFailure = Error & { output: string; logFile: string };

let runLogFolder: string | undefined;

/**
 * Setup's log of a failed install, one per run: in a folder of the run's own under the system's
 * temp folder, made the first time an install fails, so two runs at once never share a path.
 */
function installLogFile(): string {
  runLogFolder ??= fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-init-'));
  return path.join(runLogFolder, 'install.log');
}

function installFailure(
  error: Error,
  { stdout, stderr }: { stdout?: string; stderr?: string }
): InstallFailure {
  // BUILD DEBT (init-for-agents decision 6): the two streams in the order they were printed;
  // runShellCommand keeps them apart, so stdout comes first here.
  const output = [stdout, stderr].filter((stream) => stream && stream.trim() !== '').join('\n');
  return Object.assign(error, { output, logFile: installLogFile() });
}

/** Run a package install; a failure writes the whole output to setup's log file and throws it. */
async function runInstall(params: {
  command: string;
  projectRoot: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  try {
    await runShellCommand(params);
  } catch (error) {
    const failure = installFailure(error as Error, error as { stdout?: string; stderr?: string });
    fs.writeFileSync(failure.logFile, `$ ${params.command}\n\n${failure.output}\n`);
    throw failure;
  }
}

/**
 * The shipped answers: the package manager and CocoaPods really run, and the keyboard is really
 * read.
 */
export const liveWorkstation: Workstation = {
  sherloVersion: () => cliVersion,

  addPackage: async ({ command, projectRoot, env }) => {
    await runInstall({ command, projectRoot, env });
  },

  // BUILD DEBT (init-for-agents decision 2): adds the packages only; build writes `.rnstorybook`
  // from the templates kept in the CLI once they are installed, and on pnpm writes `allowBuilds:
  // esbuild: false` into `pnpmSettingsFile` before the install. It also adds the
  // react-native-reanimated and react-native-worklets versions that fit the app when it has none
  // (Q26 A): an app with the `expo` package, bare with Expo modules included, through `expo
  // install`, which picks its SDK's versions (Expo 55: 4.2.1 / 0.7.4); an app without it, the
  // newest that fits its React Native (below 0.87: 4.3.4 / 0.8.3).
  installStorybook: async ({ command, projectRoot }) => {
    await runInstall({ command, projectRoot });
    return { updatedPnpmSettings: false };
  },

  // CocoaPods fails with `Unicode Normalization not appropriate for ASCII-8BIT` when no locale is
  // set, as on a CI machine. So an environment naming no locale gets UTF-8 for both, and one that
  // names a locale through either variable is passed as it is.
  installPods: async ({ command, projectRoot, sherloBuildUnset }) => {
    const environmentNamesALocale = Boolean(process.env.LANG || process.env.LC_ALL);
    // The command's environment is merged over the ambient one, so an undefined value is what
    // takes SHERLO_BUILD out of it.
    await runShellCommand({
      command,
      projectRoot,
      env: {
        ...(environmentNamesALocale ? process.env : { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' }),
        ...(sherloBuildUnset ? { SHERLO_BUILD: undefined } : {}),
      },
    });
  },

  podsAreCurrent: (iosFolder) => installedPodsAreCurrent(iosFolder),

  scenesFlag: rememberedScenesFlag,
  // BUILD DEBT (init-for-agents): remembered from the same listTeams answer as scenes
  // (helpers/scenesFlag reads `featureFlags.agentSkills` beside `scenes`); off until then.
  agentSkillsFlag: () => undefined,
  askScenesFlag: decideScenesForProject,
  // BUILD DEBT (init-for-agents): helpers/scenesFlag keeps `listedFlags` when setup has them and
  // asks only when it has none, with the `personalToken` passed in (not the saved login), answering
  // both flags and rejecting a failed call; until then it asks every time, for scenes.
  settleTeamFlags: (configProject) => decideScenesForProject(configProject),

  readGit: ({ command, projectRoot }) => runShellCommand({ command, projectRoot }),

  // No shell: the host comes from the project's git remote, so it is passed as one argument, after
  // `--` so a host starting with `-` is never read as an option.
  readSshHostName: (host) =>
    new Promise((resolve) => {
      execFile('ssh', ['-G', '--', host], { timeout: 5000 }, (error, stdout) => {
        resolve(error ? null : (/^hostname (\S+)$/m.exec(stdout)?.[1] ?? null));
      });
    }),

  // BUILD DEBT (init-for-agents): `yarn config get npmMinimalAgeGate` in the project folder, its
  // number of minutes, null when Yarn fails or prints no number.
  readYarnAgeGateMinutes: async () => {
    throw new Error('readYarnAgeGateMinutes is not available yet.');
  },

  // BUILD DEBT (init-for-agents): `pnpm --version` in the folder, null when pnpm fails.
  readPnpmVersion: async () => {
    throw new Error('readPnpmVersion is not available yet.');
  },

  storybookLoader: (projectRoot) =>
    createRequire(path.join(projectRoot, 'package.json'))('storybook/internal/common'),

  /**
   * Is there a human at the keyboard who could actually press Enter? `isTTY` alone is not enough:
   * automation runs the CLI under a pseudo-terminal (`docker run -t`, `script(1)`, expect) where
   * stdin IS a tty and nobody is watching, and its EOF arrives as the byte `readEnterPress` reads
   * as CTRL+D, a deliberate cancel - so setup would fail with "Setup cancelled". `CI` is the
   * standard opt-out for exactly this (GitHub Actions, GitLab, CircleCI, Travis, Buildkite). A
   * coding agent's shell is a tty too with nobody to press Enter, so an agent its harness's
   * environment names (`runningAgent`) is nobody at the keyboard either.
   */
  somebodyIsAtTheKeyboard: () => Boolean(process.stdin.isTTY) && !process.env.CI && !runningAgent(),

  readEnterPress: (showPrompt) => {
    process.stdin.setRawMode(true);
    showPrompt();

    // A key typed before raw mode turned on is already waiting in the input. Take it out now so
    // it counts like a key pressed after.
    const keyAlreadyWaiting: Buffer | null = process.stdin.read();

    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', handleKeypress);
      };

      const handleKeypress = (key: Buffer) => {
        const keyCode = key[0];
        const killCodes = [3, 4, 26, 28]; // CTRL+C, CTRL+D, CTRL+Z, CTRL+\

        if (killCodes.includes(keyCode)) {
          cleanup();
          reject();
          return;
        }

        // Enter. A terminal still in line mode turns the key's carriage return (13) into a line
        // feed (10), so an Enter that arrives early comes in as 10.
        if (keyCode === 13 || keyCode === 10) {
          cleanup();
          resolve();
        } else {
          process.stdout.write(ansiEscapes.beep);
        }
      };

      process.stdin.on('data', handleKeypress);

      // Put the waiting key back so it reaches the handler as a 'data' event, the same way a key
      // pressed later does: however Enter arrives, the prompt ends through one path.
      if (keyAlreadyWaiting) process.stdin.unshift(keyAlreadyWaiting);
      process.stdin.resume();
    });
  },

  // A person who presses Ctrl+C at one of these makes it reject, and the setup is cancelled.
  chooseOne: ({ question, choices }) => select({ message: question, choices }),

  askForText: ({ question }) => input({ message: question }),

  askYesOrNo: ({ question }) => confirm({ message: question }),
};

let installed: Workstation = liveWorkstation;

/** The workstation in force. */
export function workstation(): Workstation {
  return installed;
}

/** Install a workstation for the duration of one posed run; the returned function undoes it. */
export function installWorkstation(next: Workstation): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/* ========================================================================== */
/* The posed workstation                                                      */
/* ========================================================================== */

/** An act the pose could not answer, and the reason - recorded the way an unscripted call is. */
export type UnansweredAct = { call: string; problem: string };

/** The acts `sherlo init` performs on the machine, as a pose states them. */
export type PosedWorkstation = {
  /**
   * The version of the Sherlo CLI the pose runs as, e.g. `"3.0.1"`. Left out: the version this CLI
   * really is. Stated, setup asks for the SDK this version asks for, so one pose holds every number
   * of an install: the CLI's version, the range it asks for, and the version the manager chose.
   */
  cli?: string;
  /**
   * What the package manager answered when asked to add Sherlo: the package it installed, with the
   * version it chose (`"@sherlo/react-native-storybook@3.1.4"`), or the bare name for the CLI's own
   * version (`cli`), the one a manager takes on any day but the day it comes out. The name is checked
   * against the package the command asked for, so a pose cannot answer an install the command
   * never made, and the package is laid into the project's node_modules at that version.
   */
  install: {
    package: string;
    /**
     * What the package manager printed when the install failed, on each stream. Left out for an
     * install that worked; stated, the install fails the way a real one does, with this output.
     */
    failed?: { stdout: string; stderr: string };
  };
  /**
   * The Storybook files setup wrote, for a project that had no Storybook: relative path ->
   * content, laid into the project folder the way the pose's `files` are, so the steps after it
   * read the project as the Storybook step left it. Left out for a project that already has Storybook,
   * where setup never runs it; stated for one that does not, it is refused.
   */
  storybook?: {
    wrote: PosedFiles;
    /**
     * What the package manager printed when adding Storybook's packages failed, on each stream:
     * stated, setup writes no Storybook file.
     */
    failed?: { stdout: string; stderr: string };
  };
  /**
   * What `pod install` answered, for a project whose `files` hold `ios/Podfile`: the pods
   * installed. Left out for a project with no Podfile, where setup never runs it. Either mismatch
   * is a refusal of the pose: a Podfile and no `pods`, or `pods` and no Podfile. `"current"` says
   * the installed pods already match the lockfile, so setup skips `pod install` and never asks it.
   */
  pods?: 'installed' | 'current';
  /**
   * Whether the service has scenes on for the project's team, for a command that asks nothing
   * (open, capture). Left out: nothing answers. Setup asks the pose's `api` instead (its team list),
   * so a setup that reaches the team's flags with this stated is a refusal of the pose.
   */
  scenes?: 'on' | 'off';
  /**
   * HOW `pod install` WAS RUN, when the pose states it: `through: 'bundler'` is `bundle exec pod
   * install` (a Gemfile names cocoapods), `sherloBuild: 'unset'` is the environment without
   * SHERLO_BUILD. Stated, the command must have run so; a mismatch is a refusal of the pose.
   */
  podInstall?: {
    through: 'bundler';
    sherloBuild: 'unset';
  };
  /**
   * What happened at the prompt: a person pressed Enter, the terminal was closed on it (the tool's
   * own cancel branch prints for it), or nobody was at the keyboard at all - no terminal, or `CI`
   * set, as when an agent or a CI job runs setup - so the prompt is never asked and the run goes on.
   *
   * Optional since init-for-agents: setup asks nothing any more, so a pose of it states no prompt.
   * BUILD DEBT: the prompt and the questions below go with the old setup's last caller.
   */
  enter?: 'pressed' | 'closed' | 'nobody';
  /**
   * What this machine's SSH config maps each host name to, as `ssh -G <host>` prints it in its
   * `hostname` line: `{ "github-work": "github.com" }` for a remote `git@github-work:acme/app.git`.
   * A host left out is answered as SSH answers a host no Host block names: the host itself. A host
   * mapped to null is one ssh could not answer for (ssh missing, or `ssh -G` failed).
   */
  sshHostNames?: Record<string, string | null>;
  /**
   * What `yarn config get npmMinimalAgeGate` prints: modern Yarn's hold on a new version, in
   * minutes (Yarn's default `1d` prints 1440). Left out: Yarn could not answer.
   */
  yarnAgeGateMinutes?: number;
  /** What `pnpm --version` prints, e.g. `"10.4.0"`. Left out: pnpm could not answer. */
  pnpmVersion?: string;
};

/**
 * Whether a manager asked for `range` may install `version`, for the ranges setup asks for: a major
 * (`^3` allows 3.x.y, never a prerelease), an exact version, or a local file or folder (anything).
 */
function rangeAllowsVersion(range: string, version: string): boolean {
  if (/^(?:file:|portal:)/.test(range)) return true;
  const caretMajor = /^\^(\d+)$/.exec(range)?.[1];
  if (caretMajor !== undefined) {
    return version.split('.')[0] === caretMajor && !version.includes('-');
  }
  return range === version;
}

/**
 * The workstation a pose declares. A pose with no `workstation` running `init` is a terminal
 * nobody sits at: the installs are refused and the prompt is refused, and none of them reaches a
 * real package manager, a real CocoaPods or a real keyboard.
 */
export function posedWorkstation(
  posed: PosedWorkstation | undefined
): Workstation & { refusals(): UnansweredAct[] } {
  const refusals: UnansweredAct[] = [];
  let packageInstallWasAsked = false;
  let podInstallWasAsked = false;
  let settledFlags: TeamFeatureFlags | undefined;
  const sherloVersion = posed?.cli ?? cliVersion;

  function refuse(call: string, problem: string): Error {
    refusals.push({ call, problem });
    return new Error(`the pose cannot answer \`${call}\`: ${problem}`);
  }

  return {
    // Read once the run is over, so an answer the command never asked for is known by then: pods
    // stated for a project with no Podfile describe a `pod install` the setup never ran. A run that
    // stopped before the dependencies step (its package install is that step's first act) asked
    // neither install, so its unused `pods` is no more refused than its unused `install`.
    refusals: () =>
      posed?.pods === 'installed' && packageInstallWasAsked && !podInstallWasAsked
        ? [
            ...refusals,
            {
              call: 'installPods',
              problem:
                'the pose answers `pod install` with `"pods": "installed"`, and the command ' +
                'never ran it - the project holds no `ios/Podfile`',
            },
          ]
        : refusals,

    sherloVersion: () => sherloVersion,

    addPackage: async ({ packageSpec, projectRoot }) => {
      packageInstallWasAsked = true;

      if (!posed) {
        // Recorded, not thrown - see this file's header for why the run carries on from here.
        refuse(
          'addPackage',
          'the pose states no `workstation`, and the command ran the package manager - an init ' +
            'needs one'
        );
        return;
      }

      const installedPackage = posed.install.package;
      if (packageNameOfSpecifier(installedPackage) !== packageNameOfSpecifier(packageSpec)) {
        refuse(
          'addPackage',
          `the pose answers the install with \`${installedPackage}\`, and the command asked the ` +
            `package manager for \`${packageSpec}\``
        );
        return;
      }

      // NO VERSION THE REQUEST NEVER ALLOWED: a manager asked for `^3` cannot answer 2.0.2, so a
      // pose cannot draw it.
      const installedName = packageNameOfSpecifier(installedPackage);
      const installedVersion = installedPackage.slice(installedName.length + 1) || sherloVersion;
      const askedRange = packageSpec.slice(installedName.length + 1);
      if (!rangeAllowsVersion(askedRange, installedVersion)) {
        refuse(
          'addPackage',
          `the pose answers the install with version ${installedVersion}, and the command asked ` +
            `the package manager for \`${packageSpec}\`, which does not allow it`
        );
        return;
      }

      // A failed install ends the way a real one does: an error carrying what the manager printed
      // and the log file a real run writes it to (a pose writes no file).
      if (posed.install.failed) {
        throw installFailure(new Error('the package manager failed'), posed.install.failed);
      }

      // The package lands in node_modules the way a real install leaves it, so what setup reads
      // back afterwards is the version the pose says the manager chose.
      const installedPackageFolder = path.join(projectRoot, 'node_modules', installedName);
      fs.mkdirSync(installedPackageFolder, { recursive: true });
      fs.writeFileSync(
        path.join(installedPackageFolder, 'package.json'),
        `${JSON.stringify({ name: installedName, version: installedVersion }, null, 2)}\n`
      );
    },

    installStorybook: async ({ projectRoot, pnpmSettingsFile }) => {
      if (!posed?.storybook) {
        // Recorded, not thrown, exactly like an unanswered `addPackage` - see this file's header.
        refuse(
          'installStorybook',
          'the project has no Storybook, so the command set Storybook up - say what it wrote ' +
            'in `"storybook": {"wrote": {...}}` in the workstation of the pose'
        );
        return { updatedPnpmSettings: false };
      }

      // A failed install of Storybook's packages ends the way addPackage's failed install does.
      if (posed.storybook.failed) {
        throw installFailure(new Error('the package manager failed'), posed.storybook.failed);
      }

      let updatedPnpmSettings = false;
      for (const [relativePath, content] of Object.entries(posed.storybook.wrote)) {
        const filePath = path.join(projectRoot, relativePath);
        // pnpm reads its settings from one file only, so a pose that writes them anywhere else
        // depicts a setup pnpm would ignore.
        if (path.basename(filePath) === 'pnpm-workspace.yaml') {
          if (filePath !== pnpmSettingsFile) {
            refuse(
              'installStorybook',
              `the pose writes pnpm's settings to \`${relativePath}\`, and pnpm reads them from ` +
                `\`${path.relative(projectRoot, pnpmSettingsFile)}\``
            );
          }
          updatedPnpmSettings = true;
        }
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(
          filePath,
          typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`
        );
      }

      return { updatedPnpmSettings };
    },

    installPods: async ({ command, sherloBuildUnset }) => {
      podInstallWasAsked = true;

      if (posed?.podInstall) {
        const throughBundler = command.includes('bundle exec pod install');
        if (!throughBundler || !sherloBuildUnset) {
          refuse(
            'installPods',
            `the pose answers a \`pod install\` run through Bundler with SHERLO_BUILD unset, and the ` +
              `command ran \`${command}\`${sherloBuildUnset ? '' : ' with SHERLO_BUILD set'}`
          );
        }
      }

      if (posed?.pods !== 'installed') {
        // Recorded, not thrown, exactly like an unanswered `addPackage` - see this file's header.
        refuse(
          'installPods',
          'the project holds `ios/Podfile`, so the command ran `pod install` - say ' +
            '`"pods": "installed"` in the workstation of the pose'
        );
      }
    },

    podsAreCurrent: () => posed?.pods === 'current',

    scenesFlag: () => (settledFlags ? flagWord(settledFlags.scenes) : posed?.scenes),
    agentSkillsFlag: () => settledFlags && flagWord(settledFlags.agentSkills),
    askScenesFlag: async () => {},
    settleTeamFlags: async (configProject, listedFlags, personalToken) => {
      if (posed?.scenes) {
        // Recorded, not thrown, exactly like an unanswered `addPackage` - see this file's header.
        refuse(
          'settleTeamFlags',
          "setup reads the team's flags from the service, and the pose states `scenes` in its " +
            "workstation - say them as the team's `featureFlags` in the pose's `listTeams` answer"
        );
      }
      settledFlags = listedFlags ?? (await askTeamFlags(configProject, personalToken));
    },

    // A pose states no git history: a read of it fails as in a folder that is not a git folder.
    readGit: () => Promise.reject(new Error('the pose holds no git history')),

    // A host the pose maps nowhere is answered as SSH answers a host no Host block names: itself.
    // A host mapped to null is one ssh could not answer for.
    readSshHostName: async (host) => {
      const named = posed?.sshHostNames?.[host];
      return named === undefined ? host : named;
    },

    readYarnAgeGateMinutes: async () => posed?.yarnAgeGateMinutes ?? null,
    readPnpmVersion: async () => posed?.pnpmVersion ?? null,

    // A posed project has no installed packages, so the pose's main config is loaded by the
    // Storybook this repository installs: the same loader, reading the pose's real files.
    storybookLoader: () => createRequire(__filename)('storybook/internal/common'),

    // A pose that says Enter was pressed or the terminal closed says somebody was asked, so the
    // prompt prints and `enter` below decides what they did. `nobody` is the run with no keyboard
    // behind it, so the prompt is never asked. A pose that says nothing is a terminal nobody sits
    // at, and the tool's own cancel branch is what a reader should see.
    somebodyIsAtTheKeyboard: () => {
      if (!posed) {
        throw refuse(
          'somebodyIsAtTheKeyboard',
          'the pose states no `workstation`, and the command reached the prompt - say whether ' +
            'Enter was pressed'
        );
      }

      return posed.enter !== 'nobody';
    },

    readEnterPress: async (showPrompt) => {
      showPrompt();
      // `closed` is the terminal going away where the tool waits, which is exactly what the kill
      // key a real run reads there does; `pressed` is a person, and the run goes on.
      if (posed?.enter === 'closed') throw new Error('nobody pressed Enter');
    },

    // A pose cannot state an answer to a question, so a posed run that reaches one is refused,
    // the way `somebodyIsAtTheKeyboard` is with no `workstation`, and the setup is cancelled.
    chooseOne: async ({ question }) => {
      throw refuse('chooseOne', `the pose cannot answer the question "${question}"`);
    },

    askForText: async ({ question }) => {
      throw refuse('askForText', `the pose cannot answer the question "${question}"`);
    },

    askYesOrNo: async ({ question }) => {
      throw refuse('askYesOrNo', `the pose cannot answer the question "${question}"`);
    },
  };
}

/** A flag in the words of `scenesFlag()`: off unless the service said `true`. */
function flagWord(flag: boolean | undefined): 'on' | 'off' {
  return flag ? 'on' : 'off';
}

/**
 * The flags of `configProject`'s team, asked through the server seam with the login setup found
 * the project with: a team the list does not hold has none on. A FAILED CALL REJECTS: read as off,
 * it would leave a team with scenes on set up without them, and say nothing. A posed run's seams
 * answer from the pose, so its team list holds the flags.
 *
 * BUILD DEBT (init-for-agents): helpers/scenesFlag answers both flags, and this goes - the live
 * and the posed `settleTeamFlags` then share its one reader.
 */
async function askTeamFlags(
  configProject: string,
  personalToken: string
): Promise<TeamFeatureFlags> {
  const { teamId } = parseConfigProject(configProject);
  const { teams } = await serverCalls().listTeams({ personalToken });

  return teams.find((team) => team.id === teamId)?.featureFlags ?? {};
}
