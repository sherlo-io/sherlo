/**
 * THE SURROUNDINGS SEAM - the settings a command reads from its environment, and what the git
 * read answers.
 *
 * These are the two facts a command takes from OUTSIDE the project folder, and neither of them
 * is something a pose can be asked to do without: `SKIP_INTRO` decides whether the logo prints,
 * `CI` decides whether the closer carries its machine line, and the branch and commit a run
 * reports are whatever git said when it was asked.
 *
 *     live   - the process's own environment, and a real `git` in the project folder.
 *     posed  - the pose's `env`, and the pose's `git`.
 *
 * WHY THE SETTINGS ARE INSTALLED RATHER THAN READ THROUGH A METHOD. A setting is read in a dozen
 * places across the tool - the intro, the closer, the branch resolver's whole CI-provider ladder,
 * the endpoint override - and every one of them reads `process.env`. Routing each through an
 * accessor would be a large diff whose only content is plumbing, and it would still have to be
 * complete to be worth anything: one missed read and a posed run inherits the machine it ran on.
 * Swapping the environment itself is complete by construction, which is the property that matters.
 */
import type { GitInfo } from '../helpers/getGitInfo';
import { degradeGitInfo, readGitInfoFromDisk } from '../helpers/getGitInfo';

/** What a command reads from outside its project folder. */
export type Surroundings = {
  /**
   * Make this run's settings the ones every `process.env` read answers from.
   * Returns the function that puts back what was there before.
   */
  installSettings(): () => void;
  /** What the git read answers for a project folder. */
  readGitInfo(projectRoot: string, options?: { branchOverride?: string }): Promise<GitInfo>;
};

/** The shipped answers: the process's own environment, and a real `git`. */
export const liveSurroundings: Surroundings = {
  // The process's environment is already the answer, so there is nothing to install and nothing
  // to undo.
  installSettings: () => () => undefined,
  readGitInfo: readGitInfoFromDisk,
};

/**
 * What the git read answers - from a real repository, or from whatever a pose says instead.
 * EVERY caller in the tool comes through here; ../helpers/getGitInfo has no default export, so
 * there is no second way in.
 */
export function getGitInfo(
  projectRoot: string,
  options?: { branchOverride?: string }
): Promise<GitInfo> {
  return surroundings().readGitInfo(projectRoot, options);
}

let installed: Surroundings = liveSurroundings;

/** The surroundings in force. */
export function surroundings(): Surroundings {
  return installed;
}

/** Install surroundings for the duration of one posed run; the returned function undoes it. */
export function installSurroundings(next: Surroundings): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/** What a pose says the git read answers. */
export type PosedGit = { branch: string; commit: string; dirty: boolean } | 'none' | 'unavailable';

/**
 * The surroundings a pose declares.
 *
 * `'none'` and `'unavailable'` both take the branch a FAILED git read takes today - the tool has
 * exactly one of those, {@link degradeGitInfo}, and it warns and carries on with unknowns. They
 * are told apart by the sentence the warning carries, which is the only thing about them a user
 * ever sees.
 *
 * The stand-in error's `stack` is set rather than left to node, because the warning prints the
 * error itself: a real stack names this machine's file paths, and a screen committed to a
 * catalogue cannot carry those.
 */
export function posedSurroundings({
  env,
  git,
}: {
  env: Record<string, string>;
  git: PosedGit;
}): Surroundings {
  return {
    installSettings: () => {
      const previous = process.env;
      process.env = { ...env };
      return () => {
        process.env = previous;
      };
    },

    readGitInfo: async (_projectRoot: string, options?: { branchOverride?: string }) => {
      if (git === 'none') return degradeGitInfo(statedError('not a git repository'));
      if (git === 'unavailable') return degradeGitInfo(statedError('the git read failed'));

      return {
        // `--git-branch` overrides whatever git said, on a posed run exactly as on a live one.
        branchName: options?.branchOverride ?? git.branch,
        commitHash: git.commit,
        // The commit's SUBJECT LINE. The contract does not carry one and a pose may not
        // supply a sentence, so it is stated here once: nothing the tool prints reads this
        // field - it is composed into the `openBuild` payload and nowhere else.
        commitName: 'unknown',
        isDirty: git.dirty,
      };
    },
  };
}

/* ========================================================================== */

/** An error whose printed form is the sentence it was given, and nothing about this machine. */
function statedError(message: string): Error {
  const error = new Error(message);
  error.stack = `Error: ${message}`;
  return error;
}
