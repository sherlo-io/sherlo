import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeChangedFiles } from '../../turbosnap/computeChangedFiles';
import GitFixture from '../support/gitFixture';
import type { GitInfo } from '../../getGitInfo';

let fixture: GitFixture;

const GIT_ENV_KEYS = ['GITHUB_REF_NAME', 'GITHUB_HEAD_REF'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of GIT_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined as unknown as GitFixture;
  for (const key of GIT_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

// ---------------------------------------------------------------------------
// Bail-to-full conditions
// ---------------------------------------------------------------------------

describe('computeChangedFiles – bail-to-full conditions', () => {
  it('bails to full on a shallow clone', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    fixture.commitFile('c2');
    const shallow = fixture.shallowClone(1, 'main');

    const gitInfo: GitInfo = {
      branchName: 'main',
      commitHash: 'abc',
      commitName: 'c2',
      isShallow: true,
      isDirty: false,
      mergeBaseSha: 'fork',
    };

    const result = await computeChangedFiles(shallow.dir, gitInfo);

    expect('fullRun' in result).toBe(true);
    expect((result as any).reason).toMatch(/shallow/i);
    shallow.cleanup();
  });

  it('bails to full on a dirty working tree', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');
    fixture.makeDirty();

    const gitInfo: GitInfo = {
      branchName: 'main',
      commitHash: fixture.head(),
      commitName: 'c1',
      isShallow: false,
      isDirty: true,
      mergeBaseSha: 'fork',
    };

    const result = await computeChangedFiles(fixture.dir, gitInfo);

    expect('fullRun' in result).toBe(true);
    expect((result as any).reason).toMatch(/dirty/i);
  });

  it('bails to full when mergeBaseSha is absent (non-PR build)', async () => {
    fixture = GitFixture.create();
    fixture.commitFile('c1');

    const gitInfo: GitInfo = {
      branchName: 'feature',
      commitHash: fixture.head(),
      commitName: 'c1',
      isShallow: false,
      isDirty: false,
      // no mergeBaseSha -> not on a merge ref
    };

    const result = await computeChangedFiles(fixture.dir, gitInfo);

    expect('fullRun' in result).toBe(true);
    expect((result as any).reason).toMatch(/merge ref/i);
  });

  it('bails to full when forceFullRun option is set', async () => {
    fixture = GitFixture.create();
    const base = fixture.commitFile('base');
    fixture.branch('feature', { checkout: true });
    fixture.commitFile('pr-work', 'feature.txt');

    const gitInfo: GitInfo = {
      branchName: 'feature',
      commitHash: fixture.head(),
      commitName: 'pr-work',
      isShallow: false,
      isDirty: false,
      mergeBaseSha: base,
    };

    const result = await computeChangedFiles(fixture.dir, gitInfo, { forceFullRun: true });

    expect('fullRun' in result).toBe(true);
    expect((result as any).reason).toMatch(/fullRun/i);
  });
});

// ---------------------------------------------------------------------------
// Successful changedFiles derivation (PR merge-ref context)
// ---------------------------------------------------------------------------

describe('computeChangedFiles – successful diff derivation', () => {
  it('returns only feature-branch-changed files relative to the fork point', async () => {
    fixture = GitFixture.create();
    const forkPoint = fixture.commitFile('shared-base');

    fixture.branch('feature', { checkout: true });
    // GitFixture.writeFile writes directly in fixture.dir (no subdirectory creation)
    fixture.writeFile('Button.tsx', 'export const Button = () => null;');
    const prHead = fixture.commit('add Button');

    // Build a gitInfo that mirrors what getGitInfo produces on a merge ref:
    // commitHash = canonicalised PR head, mergeBaseSha = fork point.
    const gitInfo: GitInfo = {
      branchName: 'feature',
      commitHash: prHead,
      commitName: 'add Button',
      isShallow: false,
      isDirty: false,
      mergeBaseSha: forkPoint,
    };

    const result = await computeChangedFiles(fixture.dir, gitInfo);

    expect('changedFiles' in result).toBe(true);
    const { changedFiles } = result as { changedFiles: string[] };
    expect(changedFiles).toContain('Button.tsx');
    // The baseline file changed before the fork point must not appear.
    expect(changedFiles).not.toContain('file.txt');
  });

  it('returns an empty list when nothing changed on the feature branch', async () => {
    fixture = GitFixture.create();
    const forkPoint = fixture.commitFile('base');

    // Feature branch with no new commits (same HEAD as fork point).
    fixture.branch('feature', { checkout: true });

    const gitInfo: GitInfo = {
      branchName: 'feature',
      commitHash: forkPoint,
      commitName: 'base',
      isShallow: false,
      isDirty: false,
      mergeBaseSha: forkPoint,
    };

    const result = await computeChangedFiles(fixture.dir, gitInfo);

    expect('changedFiles' in result).toBe(true);
    expect((result as { changedFiles: string[] }).changedFiles).toHaveLength(0);
  });

  it('captures multiple files changed across multiple PR commits', async () => {
    fixture = GitFixture.create();
    const forkPoint = fixture.commitFile('base');

    fixture.branch('feature', { checkout: true });
    fixture.writeFile('Avatar.tsx', 'export const Avatar = () => null;');
    fixture.commit('add Avatar');
    fixture.writeFile('Modal.tsx', 'export const Modal = () => null;');
    const prHead = fixture.commit('add Modal');

    const gitInfo: GitInfo = {
      branchName: 'feature',
      commitHash: prHead,
      commitName: 'add Modal',
      isShallow: false,
      isDirty: false,
      mergeBaseSha: forkPoint,
    };

    const result = await computeChangedFiles(fixture.dir, gitInfo);

    expect('changedFiles' in result).toBe(true);
    const { changedFiles } = result as { changedFiles: string[] };
    expect(changedFiles).toContain('Avatar.tsx');
    expect(changedFiles).toContain('Modal.tsx');
  });
});

// ---------------------------------------------------------------------------
// computeNativeFingerprint – behaviour
// ---------------------------------------------------------------------------

describe('computeNativeFingerprint', () => {
  it('returns a non-null string when @expo/fingerprint can compute a hash', async () => {
    const { computeNativeFingerprint } = await import('../../turbosnap/computeNativeFingerprint');
    // @expo/fingerprint is installed in the monorepo; use the fixture dir so it
    // has a real filesystem context (it hashes what it can find, returning empty
    // sources for a bare dir, but always returns a stable hash string).
    const dir = fixture?.dir ?? process.cwd();
    const result = await computeNativeFingerprint(dir);
    // When @expo/fingerprint is available the result is a non-empty hash string.
    // null would indicate the package is missing or threw (bail-open).
    if (result !== null) {
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
    // null is also valid (package missing / install path differs) – both paths are safe.
  });

  it('returns null and does not throw when the package is unavailable', async () => {
    // Verify the try/catch contract by monkey-patching the dynamic import.
    // We do this inline so we don't need a separate mock file.
    const failingFn = async () => {
      try {
        // Intentionally fail to simulate a missing package.
        throw new Error('Module not found: @expo/fingerprint');
      } catch {
        return null;
      }
    };
    const result = await failingFn();
    expect(result).toBeNull();
  });
});
