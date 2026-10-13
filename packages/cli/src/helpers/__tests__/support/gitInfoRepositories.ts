import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach } from 'vitest';
import GitFixture from './gitFixture';

/**
 * WHAT EVERY getGitInfo TEST FILE SHARES: the repositories its cases read, a GitHub event payload
 * on disk, and an environment cleared of every CI signal getGitInfo reads. The getGitInfo cases
 * are split across files by subject so each stays fast; this is the one copy of what they share.
 */

// getGitInfo reads env vars from several CI providers; neutralise all of them
// so the suite is stable whether it runs locally or inside any CI environment.
const GIT_ENV_KEYS = [
  'GITHUB_HEAD_REF',
  'GITHUB_REF_NAME',
  'GITHUB_EVENT_PATH',
  'SHERLO_BRANCH',
  'BITRISE_GIT_BRANCH',
  'CIRCLE_BRANCH',
  'CI_COMMIT_REF_NAME',
  'CM_BRANCH',
  'BUILD_SOURCEBRANCH',
  'SYSTEM_PULLREQUEST_SOURCEBRANCH',
] as const;

const eventFiles: string[] = [];
const repositoriesOfThisCase: GitFixture[] = [];

/**
 * Before each case, clear every CI signal getGitInfo reads; after it, put them back and remove
 * what the case made - its event payloads and its own repositories. Call once per test file.
 */
export function isolateEachCase(): void {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of GIT_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    while (repositoriesOfThisCase.length) repositoriesOfThisCase.pop()!.cleanup();
    while (eventFiles.length) {
      fs.rmSync(path.dirname(eventFiles.pop()!), { recursive: true, force: true });
    }
    for (const key of GIT_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });
}

/** A fresh repository for one case alone, removed when the case ends. */
export function ownRepository(): GitFixture {
  const repository = GitFixture.create();
  repositoriesOfThisCase.push(repository);
  return repository;
}

/**
 * Writes a GitHub Actions event payload to a temp file and returns its path, so
 * a test can point GITHUB_EVENT_PATH at it (mirroring how the runner exposes the
 * triggering event's JSON to a job). Removed when the case ends.
 */
export function writeGitHubEvent(payload: unknown): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-gh-event-')), 'event.json');
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
  eventFiles.push(file);
  return file;
}

/*
 * THE SHAPES SEVERAL CASES READ. getGitInfo only reads a repository, so a file builds each shape
 * it needs once, in its beforeAll, and its cases share it instead of each paying for the git
 * processes that build it. A case that needs a shape of its own builds it with ownRepository().
 */

/** One commit, `c1`, on main. */
export function oneCommitRepository(): GitFixture {
  const repository = GitFixture.create();
  repository.commitFile('c1');
  return repository;
}

/** Three commits on main, `c1` to `c3`, with their SHAs. */
export type ThreeCommits = { repository: GitFixture; c1: string; c2: string; c3: string };

export function threeCommitRepository(): ThreeCommits {
  const repository = GitFixture.create();
  const c1 = repository.commitFile('c1');
  const c2 = repository.commitFile('c2');
  const c3 = repository.commitFile('c3');
  return { repository, c1, c2, c3 };
}

/** A pull request merged into main: `base`, then a merge of `feature`, whose one commit is `prHead`. */
export type MergedPullRequest = {
  repository: GitFixture;
  base: string;
  prHead: string;
  mergeSha: string;
};

export function mergePullRequest(): MergedPullRequest {
  const repository = GitFixture.create();
  const base = repository.commitFile('base on main');
  repository.branch('feature', { checkout: true });
  const prHead = repository.commitFile('pr head commit', 'feature.txt');
  repository.checkout('main');
  const mergeSha = repository.merge('feature');
  return { repository, base, prHead, mergeSha };
}
