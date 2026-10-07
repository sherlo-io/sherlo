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
 * WHAT IS NOT HERE. The progress init reports as it goes is a call to the backend like any other,
 * so it rides ../seams/serverCalls and is scripted in the pose's `api` as `trackCliInit`. And
 * WHICH package manager the project uses is not an act at all - it is read out of the project's
 * own `package.json` and lockfiles, which a pose already lays out in `files`.
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
import runShellCommand from '../helpers/runShellCommand';

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
  }): Promise<void>;

  /** Whether there is a person at the keyboard who could answer a prompt at all. */
  somebodyIsAtTheKeyboard(): boolean;

  /** Wait for the key they press: Enter resolves, a kill key rejects and the setup is cancelled. */
  readEnterPress(): Promise<void>;

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
  installPods: async ({ command, projectRoot }) => {
    const environmentNamesALocale = Boolean(process.env.LANG || process.env.LC_ALL);

    await runShellCommand({
      command,
      projectRoot,
      env: environmentNamesALocale ? process.env : { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
    });
  },

  /**
   * Is there a human at the keyboard who could actually press Enter?
   *
   * TWO CONDITIONS, AND THE SECOND ONE IS NOT REDUNDANT. `isTTY` alone answers "is stdin a
   * terminal", which is NOT the same question - plenty of automation runs the CLI under a
   * pseudo-terminal: `docker run -t`, `script(1)`, expect, and any tool that records terminal
   * output. Under one of those, stdin IS a tty and yet nobody is watching. Worse, such a stdin
   * usually reaches EOF immediately, and a pty signals EOF by delivering the end-of-transmission
   * byte (4) - which `readEnterPress` below reads as CTRL+D and treats as a deliberate cancel. So
   * `sherlo init` in a pty-allocating pipeline did not merely hang: it printed the prompt and then
   * failed the setup with "Setup cancelled", leaving no sherlo.config.json behind.
   *
   * `CI` is the standard opt-out every mature CLI honours for exactly this, and it is set by
   * GitHub Actions, GitLab, CircleCI, Travis and Buildkite alike.
   */
  somebodyIsAtTheKeyboard: () => Boolean(process.stdin.isTTY) && !process.env.CI,

  readEnterPress: () => {
    process.stdin.setRawMode(true);
    process.stdin.resume();

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

        if (keyCode === 13) {
          // Enter
          cleanup();
          resolve();
        } else {
          process.stdout.write(ansiEscapes.beep);
        }
      };

      process.stdin.on('data', handleKeypress);
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
   * is a refusal of the pose: a Podfile and no `pods`, or `pods` and no Podfile.
   */
  pods?: 'installed';
  /**
   * What happened at the prompt: a person pressed Enter, the terminal was closed on it (the tool's
   * own cancel branch prints for it), or nobody was at the keyboard at all - no terminal, or `CI`
   * set, as when an agent or a CI job runs setup - so the prompt is never asked and the run goes on.
   */
  enter: 'pressed' | 'closed' | 'nobody';
  /**
   * What the person picked at each choice setup offered, in the order it asked, by the value of the
   * choice - `"eas"` at "Where should Sherlo build your app?". Left out when setup offers no choice
   * the pose follows; a choice the pose has no answer for is refused, and the setup is cancelled.
   */
  picks?: string[];
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
  let picksTaken = 0;

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

    installPods: async () => {
      podInstallWasAsked = true;

      if (posed?.pods !== 'installed') {
        // Recorded, not thrown, exactly like an unanswered `addPackage` - see this file's header.
        refuse(
          'installPods',
          'the project holds `ios/Podfile`, so the command ran `pod install` - say ' +
            '`"pods": "installed"` in the workstation of the pose'
        );
      }
    },

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

    readEnterPress: async () => {
      // `closed` is the terminal going away where the tool waits, which is exactly what the kill
      // key a real run reads there does; `pressed` is a person, and the run goes on.
      if (posed?.enter === 'closed') throw new Error('nobody pressed Enter');
    },

    // A choice is answered by the pose's next pick, matched against the choices' values - a pick the
    // choice does not offer, or no pick at all, is refused and the setup is cancelled. Free-text and
    // yes-or-no questions still have no posed answer.
    chooseOne: async ({ question, choices }) => {
      const pick = posed?.picks?.[picksTaken];
      picksTaken += 1;
      const chosen = choices.find((choice) => String(choice.value) === pick);
      if (!chosen) {
        throw refuse(
          'chooseOne',
          pick === undefined
            ? `the pose has no pick for the question "${question}"`
            : `the pose picks "${pick}" at "${question}", which offers ${choices.map((choice) => `"${String(choice.value)}"`).join(', ')}`
        );
      }
      return chosen.value;
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
