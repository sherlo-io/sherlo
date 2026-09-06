/**
 * Give a shallow CI checkout enough history for Sherlo to read its lineage -
 * so a workflow never has to set `fetch-depth` for baselines to work.
 *
 * WHY THIS EXISTS. `actions/checkout` clones at depth 1 by default: HEAD arrives
 * with its parents grafted away. The CLI captures a build's ancestry from that
 * clone (packages/cli/src/helpers/getGitInfo.ts) and sends it with the build, and
 * the server inherits a baseline by walking it. With one commit and no parents
 * there is nothing to walk, so every build looks like a first build - a cold
 * start, every run, with no visible cause. Asking every customer to remember
 * `fetch-depth` is a documentation fix for a machine problem; this is the machine
 * fixing it.
 *
 * WHY DEEPENING WORKS ON BOTH ROADS. On a `push` checkout HEAD is a branch tip,
 * and on a `pull_request` checkout it is a detached `refs/pull/N/merge` commit
 * whose second parent (the real PR head) is grafted away. A bare
 * `git fetch --deepen` extends the shallow boundary of whatever HEAD sits on, so
 * both roads recover their ancestry - the PR road recovers `HEAD^2`, which is
 * exactly what getGitInfo needs to canonicalise the commit.
 *
 * WHY IT NEVER FAILS THE RUN. The fetch needs the checkout's persisted
 * credentials, which a workflow can turn off (`persist-credentials: false`). When
 * it can't repair the clone it says so loudly and continues: the CLI already has
 * a degraded road for a shallow repo (it records `isShallow` and reports what it
 * could reach), and a run the CLI is designed to survive must not be killed by
 * the convenience that tried to improve it.
 */
import { spawnSync } from 'node:child_process';

/**
 * How many commits of history to recover.
 *
 * MUST MATCH `ANCESTOR_LIMIT` in packages/cli/src/helpers/getGitInfo.ts, which
 * caps every ancestry window the CLI sends at 200 SHAs. Fetching deeper buys
 * history nobody transmits; fetching shallower truncates the window the server
 * inherits from. The two numbers move together - change one, change the other.
 */
export const LINEAGE_DEPTH = 200;

/**
 * Repair a shallow checkout in `workingDirectory`, and return what happened:
 *
 * - `'not-a-repository'`  - nothing here to deepen; the CLI reports git as unknown.
 * - `'already-deep'`      - a full clone. Costs ONE probe and nothing else.
 * - `'deepened'`          - was shallow, now has ancestry to read.
 * - `'deepen-failed'`     - the fetch was rejected (usually missing credentials).
 * - `'no-lineage-gained'` - the fetch succeeded but HEAD still has no ancestors.
 *
 * The last two warn loudly, naming what degrades and how to fix it, then return
 * normally so the caller runs the CLI anyway.
 */
export function deepenShallowCheckout({
  workingDirectory = process.cwd(),
  runGit = (args) => runGitIn(workingDirectory, args),
  log = console.log,
} = {}) {
  const shallowProbe = runGit(['rev-parse', '--is-shallow-repository']);

  // Not a git repository at all (or a git too old to know the flag). There is no
  // shallow clone to repair and nothing a warning could tell anyone to do.
  if (!shallowProbe.ok) return 'not-a-repository';
  if (shallowProbe.stdout.trim() !== 'true') return 'already-deep';

  log(
    `Shallow checkout detected - deepening by ${LINEAGE_DEPTH} commits so baseline inheritance has lineage to read.`
  );

  const deepen = runGit(['fetch', `--deepen=${LINEAGE_DEPTH}`, '--quiet']);

  if (!deepen.ok) {
    warnLineageIsMissing(
      log,
      `git fetch --deepen=${LINEAGE_DEPTH} failed: ${deepen.stderr.trim()}`
    );
    return 'deepen-failed';
  }

  // Verify by ANCESTRY, not by re-probing `--is-shallow-repository`: deepening a
  // repository with more than LINEAGE_DEPTH commits leaves it legitimately
  // shallow at its new, deeper boundary, and warning about that would fire on
  // nearly every successful repair. What actually matters is whether HEAD now has
  // ancestors to walk - a count of 1 means it still stands alone.
  const firstParentChain = runGit(['rev-list', '--count', '--first-parent', 'HEAD']);
  const reachableCommits = Number(firstParentChain.stdout.trim());

  if (firstParentChain.ok && reachableCommits === 1) {
    warnLineageIsMissing(log, 'the deepen reported success but HEAD still has no ancestors.');
    return 'no-lineage-gained';
  }

  return 'deepened';
}

/* ========================================================================== */

/**
 * Say - in the run summary, not just the log - that this build will arrive
 * without lineage, what that costs, and the two ways to fix it.
 *
 * The annotation is flattened to ONE line: git's failure text is usually several
 * (`fatal: could not read Username…` and friends), and a workflow-command line
 * that contains a newline is cut off at it, hiding the very cause it carries.
 */
function warnLineageIsMissing(log, cause) {
  const warning =
    `Could not deepen this shallow checkout - ${cause} ` +
    'This build will be sent with no commit ancestry, so Sherlo cannot inherit a baseline ' +
    'and every run starts cold. Fix it by keeping the checkout credentials ' +
    '(`persist-credentials` defaults to true) or by setting `fetch-depth: 0` on actions/checkout yourself.';

  log(`::warning title=Sherlo::${warning.replace(/\r?\n/g, ' ')}`);
  log('');
  log(
    '  This run continues - Sherlo tests the commit, it just has no baseline to compare against.'
  );
  log('');
}

/**
 * Run one git command and report its outcome without ever throwing: every caller
 * above treats a failed git as a condition to handle, never as a crash.
 */
function runGitIn(workingDirectory, args) {
  const result = spawnSync('git', args, { cwd: workingDirectory, encoding: 'utf8' });

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? String(result.error?.message ?? ''),
  };
}
