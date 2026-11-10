/**
 * WHAT GIT SAYS ABOUT EACH FILE, last 12 months - one `git log --numstat`, no blame.
 *
 * Rework is counted from line totals alone: a commit that deletes lines from a file takes them
 * from the lines earlier commits added to that file in the 21 days before, oldest first. A
 * commit that touches more than SWEEP_FILES files is a sweep (a rename, a format) and says
 * nothing about any one file, so it counts for none.
 *
 * Fix commits count only when at least FIX_SHARE of the repo's commit subjects are `fix:` ones:
 * a repo that does not write them that way would be ranked on a handful of lucky matches. A
 * shallow clone is read as far as it goes, and says its history may be cut.
 */
import { workstation } from '../../seams/workstation';
import type { FileHistory } from './suggestItems';

const REWORK_DAYS = 21;
const SWEEP_FILES = 30;
const FIX_SHARE = 0.05;
const FIX_SUBJECT = /^fix(\([^)]*\))?!?:/i;
const REVERT_SUBJECT = /^Revert "/;

export async function gitHistory(
  projectRoot: string
): Promise<{ history: Map<string, FileHistory>; shallow: boolean }> {
  const history = new Map<string, FileHistory>();
  let output: string;
  let shallow: boolean;
  try {
    shallow =
      (
        await workstation().readGit({
          command: 'git rev-parse --is-shallow-repository',
          projectRoot,
        })
      ).trim() === 'true';
  } catch {
    return { history, shallow: false };
  }
  try {
    output = await workstation().readGit({
      command:
        'git log --since="12 months ago" --no-merges --no-renames --numstat --relative ' +
        '--format="@@%ct%x09%s" -- .',
      projectRoot,
    });
  } catch {
    // Not a git folder, or no commits: the plan ranks on the code alone.
    return { history, shallow };
  }

  type Commit = {
    time: number;
    subject: string;
    files: { file: string; added: number; deleted: number }[];
  };
  const commits: Commit[] = [];
  for (const line of output.split('\n')) {
    if (line.startsWith('@@')) {
      const [time, ...subject] = line.slice(2).split('\t');
      commits.push({ time: Number(time), subject: subject.join('\t'), files: [] });
    } else if (line.includes('\t') && commits.length > 0) {
      const [added, deleted, file] = line.split('\t');
      if (added !== '-') {
        commits[commits.length - 1].files.push({
          file,
          added: Number(added),
          deleted: Number(deleted),
        });
      }
    }
  }

  const countsFixes =
    commits.length > 0 &&
    commits.filter((commit) => FIX_SUBJECT.test(commit.subject)).length / commits.length >=
      FIX_SHARE;
  const pools = new Map<string, { time: number; left: number }[]>();
  for (const commit of commits.reverse()) {
    if (commit.files.length > SWEEP_FILES) continue;
    for (const { file, added, deleted } of commit.files) {
      const entry = history.get(file) ?? { changes: 0, rework: 0, reverts: 0, fixes: 0 };
      entry.changes += 1;
      if (REVERT_SUBJECT.test(commit.subject)) entry.reverts += 1;
      if (countsFixes && FIX_SUBJECT.test(commit.subject)) entry.fixes += 1;

      const pool = (pools.get(file) ?? []).filter(
        (written) => commit.time - written.time <= REWORK_DAYS * 86400
      );
      let toTake = deleted;
      for (const written of pool) {
        const taken = Math.min(written.left, toTake);
        written.left -= taken;
        toTake -= taken;
        entry.rework += taken;
      }
      pool.push({ time: commit.time, left: added });
      pools.set(
        file,
        pool.filter((written) => written.left > 0)
      );
      history.set(file, entry);
    }
  }
  return { history, shallow };
}
