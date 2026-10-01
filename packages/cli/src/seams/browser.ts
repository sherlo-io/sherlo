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
 *
 * ------------------------------------------------------------------------
 * PLAN STAND-IN (epic cli-login). The live half below opens nothing yet: opening the person's real
 * browser is a build task, and until it lands the live half throws, naming itself. The posed half
 * is the one a plan draws with.
 */

/** The one act `sherlo login` performs on the browser. */
export type Browser = {
  /** Open the browser on `url`. Answers whether a browser came up. */
  open(url: string): Promise<boolean>;
};

/** The shipped answer. A build task: until it lands, it refuses rather than pretend. */
export const liveBrowser: Browser = {
  open: async () => {
    throw new Error('Opening a browser is not built into this version of the CLI yet.');
  },
};

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
