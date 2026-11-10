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
import { confirm, input, select } from '@inquirer/prompts';
import ansiEscapes from 'ansi-escapes';
import { runningAgent } from '../commands/feedback/runningAgent';
import { installedPodsAreCurrent } from '../helpers/installedPods';
import runShellCommand from '../helpers/runShellCommand';
import { decideScenesForProject, rememberedScenesFlag } from '../helpers/scenesFlag';

/** Every act `sherlo init` performs on the machine it runs on, and nothing else. */
export type Workstation = {
  /** Add one package to the project through its package manager. */
  addPackage(params: {
    /** The package the command asked for, e.g. `@sherlo/react-native-storybook`. */
    packageSpec: string;
    /** The whole command line, e.g. `yarn add -D @sherlo/react-native-storybook`. */
    command: string;
    projectRoot: string;
    env?: NodeJS.ProcessEnv;
  }): Promise<void>;

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
  /** Ask the service about that team and keep the answer for `scenesFlag()`; a pose asks nothing. */
  askScenesFlag(configProject: unknown): Promise<void>;

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
 * The shipped answers: the package manager and CocoaPods really run, and the keyboard is really
 * read.
 */
export const liveWorkstation: Workstation = {
  addPackage: async ({ command, projectRoot, env }) => {
    await runShellCommand({ command, projectRoot, env });
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
  askScenesFlag: decideScenesForProject,

  /**
   * Is there a human at the keyboard who could actually press Enter?
   *
   * `isTTY` alone answers "is stdin a terminal", which is NOT the same question. Automation runs
   * the CLI under a pseudo-terminal (`docker run -t`, `script(1)`, expect), where stdin IS a tty,
   * nobody watches, and EOF arrives as byte 4, which `readEnterPress` reads as CTRL+D: the setup
   * printed the prompt, then failed with "Setup cancelled". `CI` is the standard opt-out for that,
   * set by GitHub Actions, GitLab, CircleCI, Travis and Buildkite alike. A coding agent's shell is
   * a tty too, and nothing in it presses Enter: an agent once sat 36 minutes on the prompt. So an
   * agent known by its harness's environment (`runningAgent`) is nobody at the keyboard either.
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
   * What the package manager answered when asked to add Sherlo: the package it installed, version
   * and all (`"@sherlo/react-native-storybook@2.0.2"`). Checked against the package the command
   * actually asked for, so a pose cannot answer an install the command never made.
   */
  install: { package: string };
  /**
   * What `pod install` answered, for a project whose `files` hold `ios/Podfile`: the pods
   * installed. Left out for a project with no Podfile, where setup never runs it. Either mismatch
   * is a refusal of the pose: a Podfile and no `pods`, or `pods` and no Podfile. `"current"` says
   * the installed pods already match the lockfile, so setup skips `pod install` and never asks it.
   */
  pods?: 'installed' | 'current';
  /** Whether the service has scenes on for the project's team. Left out: nothing answers, so off. */
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
   */
  enter: 'pressed' | 'closed' | 'nobody';
};

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

    addPackage: async ({ packageSpec }) => {
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
      if (packageNameOf(installedPackage) !== packageNameOf(packageSpec)) {
        refuse(
          'addPackage',
          `the pose answers the install with \`${installedPackage}\`, and the command asked the ` +
            `package manager for \`${packageSpec}\``
        );
      }
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

    scenesFlag: () => posed?.scenes,
    askScenesFlag: async () => {},

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

/* ========================================================================== */

/** The package a spec names, without its version: `@sherlo/x@2.0.2` -> `@sherlo/x`. */
function packageNameOf(packageSpec: string): string {
  const versionSeparator = packageSpec.lastIndexOf('@');

  // Index 0 is the scope's own `@`, so a spec with no version is the whole string.
  return versionSeparator > 0 ? packageSpec.slice(0, versionSeparator) : packageSpec;
}
