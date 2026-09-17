/**
 * THE WORKSTATION SEAM - the two things `sherlo init` does TO this machine rather than reads off it.
 *
 *     live   - the package manager, run inside the project; the person at the keyboard, and the
 *              key they press.
 *     posed  - the pose's `workstation`: the package the manager answered with, and whether
 *              anybody was there to press Enter.
 *
 * `sherlo init` is the one command that ACTS on the machine. It runs the package manager to add
 * Sherlo, and it stops at a prompt until somebody presses Enter. Neither exists on a machine that
 * only has the pose - there is no registry to install from and no keyboard to press - so both are
 * here, behind one answer, and the shipped code around them runs unforked: the spinner, the beep,
 * the prompt's own words, the erase, the cancel branch, every printed line.
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
 * The tool turns a failed install into its own refusal - "Failed to install Sherlo automatically" -
 * and ends the run there. A posed install that threw would therefore replace the screen the pose
 * exists to show with the tool's install-failure screen, and whoever read it would be looking at a
 * product state the pose never described. So the refusal is RECORDED, the run carries on, and the
 * refusal block printed under the screen - with exit 1 - is what says the pose owed an answer. It
 * is the same reason ../seams/serverCalls records rather than only throws.
 *
 * THE PROMPT IS THE OTHER WAY ROUND. A pose with no `workstation` is a terminal nobody sits at, so
 * the question "is somebody there" THROWS its refusal, and the tool's own cancel branch prints
 * "Setup cancelled" - which is what a real run whose terminal went away gets. The same branch is
 * what a pose stating `enter: "closed"` is asking to see.
 */
import ansiEscapes from 'ansi-escapes';
import runShellCommand from '../helpers/runShellCommand';
import type { PosedWorkstation } from '../commands/pose/readPose';

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

  /** Whether there is a person at the keyboard who could answer a prompt at all. */
  somebodyIsAtTheKeyboard(): boolean;

  /** Wait for the key they press: Enter resolves, a kill key rejects and the setup is cancelled. */
  readEnterPress(): Promise<void>;
};

/** The shipped answers: the package manager really runs, and the keyboard is really read. */
export const liveWorkstation: Workstation = {
  addPackage: async ({ command, projectRoot, env }) => {
    await runShellCommand({ command, projectRoot, env });
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

/**
 * The workstation a pose declares. A pose with no `workstation` running `init` is a terminal
 * nobody sits at: the install is refused and the prompt is refused, and neither one reaches a real
 * package manager or a real keyboard.
 */
export function posedWorkstation(
  posed: PosedWorkstation | undefined
): Workstation & { refusals(): UnansweredAct[] } {
  const refusals: UnansweredAct[] = [];

  function refuse(call: string, problem: string): Error {
    refusals.push({ call, problem });
    return new Error(`the pose cannot answer \`${call}\`: ${problem}`);
  }

  return {
    refusals: () => refusals,

    addPackage: async ({ packageSpec }) => {
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

    // A pose that says what happened at the prompt is a pose that says somebody was asked, so the
    // prompt prints and `enter` below decides what they did. A pose that says nothing is a
    // terminal nobody sits at, and the tool's own cancel branch is what a reader should see.
    somebodyIsAtTheKeyboard: () => {
      if (!posed) {
        throw refuse(
          'somebodyIsAtTheKeyboard',
          'the pose states no `workstation`, and the command reached the prompt - say whether ' +
            'Enter was pressed'
        );
      }

      return true;
    },

    readEnterPress: async () => {
      // `closed` is the terminal going away where the tool waits, which is exactly what the kill
      // key a real run reads there does; `pressed` is a person, and the run goes on.
      if (posed?.enter === 'closed') throw new Error('nobody pressed Enter');
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
