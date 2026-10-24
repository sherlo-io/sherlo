import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import getDefaultBranch, { HOST_ASK_TIMEOUT_MS } from '../getDefaultBranch';
// The REAL git read, not the seam's dispatcher (../../seams/surroundings): this suite is
// about what the tool asks a real repository.
import { readGitInfoFromDisk as getGitInfo } from '../getGitInfo';
import runShellCommand from '../runShellCommand';
import type GitFixture from './support/gitFixture';
import { isolateEachCase, shallowCloneOfBareOrigin } from './support/gitInfoRepositories';

/**
 * A CI clone that does not name the repository's main branch: the tool asks the git host. The
 * host is a local bare repository behind a depth 1 single-branch file:// clone; a host that hangs
 * or fails is a fake git first on PATH, never a network call.
 */

isolateEachCase();

const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const savedPath = process.env.PATH;
const fakeDirs: string[] = [];

/** A depth 1 clone of a bare origin with no origin/HEAD, read by every case. */
let clone: GitFixture;
let removeClone: () => void;

beforeAll(() => {
  ({ clone, remove: removeClone } = shallowCloneOfBareOrigin());
});

afterAll(() => removeClone());

/** Puts a git first on PATH that runs onLsRemote for ls-remote and real git for everything else. */
function fakeGitHost(onLsRemote: string): { envLog: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fake-git-'));
  fakeDirs.push(dir);
  const envLog = path.join(dir, 'env.log');
  const script = [
    '#!/bin/sh',
    'if [ "$1" = "ls-remote" ]; then',
    `  echo "$GIT_TERMINAL_PROMPT|$GIT_ASKPASS" > "${envLog}"`,
    `  ${onLsRemote}`,
    'fi',
    `exec "${realGit}" "$@"`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'git'), script, { mode: 0o755 });
  process.env.PATH = `${dir}${path.delimiter}${savedPath}`;
  return { envLog };
}

beforeEach(() => {
  process.env.PATH = savedPath;
});

afterEach(() => {
  process.env.PATH = savedPath;
  while (fakeDirs.length) fs.rmSync(fakeDirs.pop()!, { recursive: true, force: true });
});

describe('the default branch asked of the git host', () => {
  it('reads the default branch from the git host when the clone records no origin/HEAD', async () => {
    const gitInfo = await getGitInfo(clone.dir);

    expect(gitInfo.defaultBranch).toBe('main');
  });

  it('asks the git host with terminal prompts off', async () => {
    const { envLog } = fakeGitHost(':');

    await getDefaultBranch(runShellCommand, clone.dir);

    expect(fs.readFileSync(envLog, 'utf8').trim()).toBe('0|false');
  });

  it('gives up on the git host after 10 seconds and sends no default branch', async () => {
    fakeGitHost('exec sleep 30');

    const startedAt = Date.now();
    const branch = await getDefaultBranch(runShellCommand, clone.dir, 300);

    expect(HOST_ASK_TIMEOUT_MS).toBe(10_000);
    expect(branch).toBeUndefined();
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it('is omitted when the git host does not answer', async () => {
    fakeGitHost('exit 128');

    const gitInfo = await getGitInfo(clone.dir);

    expect(gitInfo).not.toHaveProperty('defaultBranch');
  });
});
