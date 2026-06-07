import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Deterministic git-fixture harness for real-git tests.
 *
 * Goals:
 * - Real `git` invocations (no mocking) so behaviour matches production.
 * - Reproducible SHAs across machines and runs. Achieved via:
 *   - **dual-date pinning**: every commit pins both `GIT_AUTHOR_DATE` and
 *     `GIT_COMMITTER_DATE` to a fixed, monotonically increasing timestamp.
 *   - **identity pinning**: author/committer name + email are fixed.
 *   - **config isolation**: `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` are routed
 *     to /dev/null and `GIT_CONFIG_NOSYSTEM=1`, so the host's `~/.gitconfig`
 *     (user.name, commit.gpgsign, init.defaultBranch, …) can't leak in and
 *     perturb the hashes.
 *
 * Tests should still treat returned SHAs as opaque (compare against the value a
 * helper method returns) rather than hard-coding hex strings - determinism is
 * about stability, not about memorising a particular digest.
 */

const FIXTURE_IDENTITY = {
  name: 'Sherlo Fixture',
  email: 'fixture@sherlo.io',
} as const;

// Fixed epoch base (2021-01-01T00:00:00Z). Each commit advances by a fixed step
// so ordering is well-defined while remaining fully deterministic.
const BASE_EPOCH_SECONDS = 1_609_459_200;
const COMMIT_STEP_SECONDS = 60;

export class GitFixture {
  readonly dir: string;
  private commitCount = 0;

  private constructor(dir: string) {
    this.dir = dir;
  }

  /** Creates an isolated temp dir and runs `git init` on the `main` branch. */
  static create(): GitFixture {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-git-fixture-'));
    const fixture = new GitFixture(dir);
    fixture.git(['init', '-q', '--initial-branch=main']);
    return fixture;
  }

  /** Runs a raw git command in the fixture repo and returns trimmed stdout. */
  git(args: string[], extraEnv: NodeJS.ProcessEnv = {}): string {
    return execFileSync('git', args, {
      cwd: this.dir,
      encoding: 'utf8',
      env: this.env(extraEnv),
    }).trim();
  }

  /** Writes (or overwrites) a tracked file with deterministic content. */
  writeFile(file: string, content: string): void {
    fs.writeFileSync(path.join(this.dir, file), content, 'utf8');
  }

  /**
   * Stages all changes and commits with date/identity pinning.
   * @returns the full SHA of the new commit.
   */
  commit(message: string, opts: { allowEmpty?: boolean } = {}): string {
    this.git(['add', '-A']);
    const args = ['commit', '-q', '-m', message];
    if (opts.allowEmpty) args.push('--allow-empty');
    this.git(args, this.commitDateEnv());
    return this.head();
  }

  /** Convenience: writes a file derived from `message`, then commits. */
  commitFile(message: string, file = 'file.txt'): string {
    this.writeFile(file, `content for: ${message}\n`);
    return this.commit(message);
  }

  /** Creates a branch (without switching to it by default). */
  branch(name: string, opts: { checkout?: boolean } = {}): void {
    if (opts.checkout) {
      this.git(['checkout', '-q', '-b', name]);
    } else {
      this.git(['branch', name]);
    }
  }

  /** Switches to an existing branch, tag, or commit. */
  checkout(ref: string): void {
    this.git(['checkout', '-q', ref]);
  }

  /** Detaches HEAD at the given ref. */
  detach(ref: string): void {
    this.git(['checkout', '-q', '--detach', ref]);
  }

  /**
   * Merges `ref` into the current branch with a real merge commit (`--no-ff`).
   * The resulting commit has two parents: [current-tip, ref-tip].
   * @returns the merge commit SHA.
   */
  merge(ref: string, message = `Merge ${ref}`): string {
    this.git(['merge', '-q', '--no-ff', '--no-edit', '-m', message, ref], this.commitDateEnv());
    return this.head();
  }

  /**
   * Squash-merges `ref` into the current branch: collapses `ref`'s changes into
   * a single new commit on the current branch with a single parent.
   * @returns the squash commit SHA.
   */
  squashMerge(ref: string, message = `Squash ${ref}`): string {
    this.git(['merge', '-q', '--squash', ref]);
    return this.commit(message);
  }

  /** Rebases the current branch onto `ref`. */
  rebase(ref: string): void {
    this.git(['rebase', '-q', ref], this.commitDateEnv());
  }

  /**
   * Produces a shallow (`--depth`) clone of this repo and returns a fixture
   * pointing at the clone. The clone shares the same isolated git env.
   */
  shallowClone(depth = 1, ref = 'main'): GitFixture {
    // mkdtemp creates an empty dir; git clone is happy to populate an empty dir.
    const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-git-shallow-'));
    // Run the clone from a known-existing cwd (the target dir is the argument).
    // file:// is required for git to honour --depth against a local path.
    execFileSync(
      'git',
      ['clone', '-q', `--depth=${depth}`, '--branch', ref, `file://${this.dir}`, cloneDir],
      { cwd: os.tmpdir(), encoding: 'utf8', env: this.env({}) }
    );
    return new GitFixture(cloneDir);
  }

  /** Introduces an uncommitted change so the working tree is dirty. */
  makeDirty(file = 'dirty.txt'): void {
    this.writeFile(file, `uncommitted-${this.commitCount}\n`);
  }

  /** Full SHA of HEAD. */
  head(): string {
    return this.git(['rev-parse', 'HEAD']);
  }

  /** Full SHA of an arbitrary ref. */
  revParse(ref: string): string {
    return this.git(['rev-parse', ref]);
  }

  /** Removes the temp directory. */
  cleanup(): void {
    fs.rmSync(this.dir, { recursive: true, force: true });
  }

  /* ----------------------------------------------------------------------- */

  private env(extraEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return {
      ...process.env,
      // Config isolation - the host gitconfig must not influence hashes.
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      // Identity pinning.
      GIT_AUTHOR_NAME: FIXTURE_IDENTITY.name,
      GIT_AUTHOR_EMAIL: FIXTURE_IDENTITY.email,
      GIT_COMMITTER_NAME: FIXTURE_IDENTITY.name,
      GIT_COMMITTER_EMAIL: FIXTURE_IDENTITY.email,
      ...extraEnv,
    };
  }

  /** Dual-date pinning for the next commit; advances the deterministic clock. */
  private commitDateEnv(): NodeJS.ProcessEnv {
    const seconds = BASE_EPOCH_SECONDS + this.commitCount * COMMIT_STEP_SECONDS;
    this.commitCount += 1;
    const isoDate = `${seconds} +0000`;
    return {
      GIT_AUTHOR_DATE: isoDate,
      GIT_COMMITTER_DATE: isoDate,
    };
  }
}

export default GitFixture;
