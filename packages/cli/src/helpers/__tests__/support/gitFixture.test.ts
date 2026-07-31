import { describe, expect, it } from 'vitest';
import GitFixture from './gitFixture';

/**
 * Self-tests for the deterministic harness. The point of the dual-date pinning +
 * config isolation is that an identical sequence of operations yields identical
 * SHAs across runs and machines.
 */
describe('GitFixture determinism', () => {
  function buildSequence(): { fixture: GitFixture; shas: string[] } {
    const fixture = GitFixture.create();
    const shas = [fixture.commitFile('c1'), fixture.commitFile('c2'), fixture.commitFile('c3')];
    return { fixture, shas };
  }

  it('produces identical SHAs for an identical operation sequence', () => {
    const a = buildSequence();
    const b = buildSequence();
    try {
      expect(a.shas).toEqual(b.shas);
      // SHAs are full 40-char hex digests.
      for (const sha of a.shas) {
        expect(sha).toMatch(/^[0-9a-f]{40}$/);
      }
    } finally {
      a.fixture.cleanup();
      b.fixture.cleanup();
    }
  });

  it('supports squash and detach helpers', () => {
    const fixture = GitFixture.create();
    try {
      fixture.commitFile('base');
      fixture.branch('feature', { checkout: true });
      fixture.commitFile('feature work', 'feature.txt');
      fixture.checkout('main');
      const squash = fixture.squashMerge('feature');

      // A squash merge yields a single-parent commit on main.
      const parents = fixture.git(['rev-list', '--parents', '-n', '1', squash]).split(' ');
      expect(parents).toHaveLength(2); // [self, single-parent]

      fixture.detach('main');
      // Detached HEAD reports the literal "HEAD" as its abbreviated ref.
      expect(fixture.git(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('HEAD');
    } finally {
      fixture.cleanup();
    }
  });
});
