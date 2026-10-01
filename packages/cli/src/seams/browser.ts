/**
 * THE BROWSER SEAM - the browser `sherlo login` opens on the authorize link.
 *
 *     live   - the person's own browser, opened on the link.
 *     posed  - the pose's `browser`: whether the browser came up.
 *
 * Opening a browser is an act on this machine, and a machine that only has the pose has no browser
 * to open - so it is here, behind one answer. The command prints the link on its own line whether
 * or not the browser came up (sherlo / Logging in from the terminal); what the answer changes is
 * only the line that says the browser did not open.
 *
 * THE POSED HALF NEVER PRINTS. What a pose answers is whether the browser came up, never a word on
 * the screen.
 */
import { spawn } from 'child_process';

/** The one act `sherlo login` performs on the browser. */
export type Browser = {
  /** Open the browser on `url`. Answers whether a browser came up. */
  open(url: string): Promise<boolean>;
};

/** How long the opener is given to say it failed before it is taken to have opened a browser. */
const OPENER_GRACE_MS = 1500;

/**
 * The shipped answer: start the opener on the link and give it a short grace.
 *
 *     exits 0 within the grace         -> opened
 *     exits non-zero within the grace  -> not opened (`xdg-open` on a machine with no browser)
 *     still running when the grace ends -> opened: a `BROWSER` that is the browser itself runs
 *                                          until the person closes it
 *     cannot start at all              -> not opened
 *
 * NEVER WAITS LONGER THAN THE GRACE. The opener runs detached and is let go from the start, so a
 * browser that keeps running never holds the login before the wait line.
 *
 * NEVER THROWS. When the answer is "not opened", the command says the browser did not open - the
 * link is on the screen anyway.
 */
export const liveBrowser: Browser = {
  open: (url) =>
    new Promise((resolve) => {
      const [program, ...args] = openerCommand(url);

      try {
        const opener = spawn(program, args, {
          detached: true,
          stdio: 'ignore',
          windowsVerbatimArguments: true,
        });
        opener.unref();

        const stillRunningAfterGrace = setTimeout(() => resolve(true), OPENER_GRACE_MS);
        const answer = (opened: boolean) => {
          clearTimeout(stillRunningAfterGrace);
          resolve(opened);
        };

        opener.on('error', () => answer(false));
        opener.on('exit', (exitCode) => answer(exitCode === 0));
      } catch {
        resolve(false);
      }
    }),
};

/**
 * The program that opens a link, and its arguments: the one `BROWSER` names when it is set, else
 * the platform's own opener. Read here, in the live half only - a posed run never reads `BROWSER`.
 *
 * A test sets `BROWSER=true` for a browser that "opened" without opening anything: `true` is a
 * program that exits 0 and does nothing else.
 */
function openerCommand(url: string): string[] {
  const browserProgram = process.env.BROWSER?.trim();
  if (browserProgram) return [browserProgram, url];

  if (process.platform === 'darwin') return ['open', url];
  // `start` takes its first quoted argument as a window title, so an empty title goes first.
  if (process.platform === 'win32') return ['cmd', '/c', 'start', '""', url];

  return ['xdg-open', url];
}

let installed: Browser = liveBrowser;

/** The browser in force. */
export function browser(): Browser {
  return installed;
}

/** Install a browser for the duration of one posed run; the returned function undoes it. */
export function installBrowser(next: Browser): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/* ========================================================================== */
/* The posed browser                                                          */
/* ========================================================================== */

/** What the browser did when a login opened it, as a pose states it. */
export type PosedBrowser = {
  /**
   * Whether a browser came up on the authorize link. `false` is a machine with no browser, such as
   * a session over SSH: the tool still prints the link, and says the browser did not open.
   */
  opened: boolean;
};

/** An act the pose could not answer, and the reason - recorded the way an unscripted call is. */
export type UnansweredBrowser = { call: string; problem: string };

/**
 * The browser a pose declares. Nothing opens. A login that reaches the browser with no `browser`
 * in its pose is refused - RECORDED rather than thrown, so the screen goes on to show the link and
 * the wait, and the refusal block under it says what the pose owed.
 */
export function posedBrowser(
  posed: PosedBrowser | undefined
): Browser & { refusals(): UnansweredBrowser[] } {
  const refusals: UnansweredBrowser[] = [];

  return {
    refusals: () => refusals,

    open: async () => {
      if (!posed) {
        refusals.push({
          call: 'openBrowser',
          problem:
            'the pose states no `browser`, and the command opened one - say whether it came up',
        });
        return false;
      }

      return posed.opened;
    },
  };
}
