/**
 * Tests for the shallow-checkout repair - the reason a workflow using this action
 * never has to set `fetch-depth`.
 *
 * THE POINT is that lineage arrives with the build. `actions/checkout` clones at
 * depth 1, the CLI reads a build's ancestry from that clone, and the server
 * inherits a baseline by walking it - so a depth-1 clone means a cold start on
 * every run. These tests pin the three behaviours that matter: a full clone is
 * left completely alone, a shallow one is deepened by exactly the number of
 * commits the CLI transmits, and a deepen the runner cannot perform warns loudly
 * instead of failing the run.
 *
 * git is stood in for by a recording fake, so each case is an exact script of
 * command outcomes rather than a real network fetch.
 */
import { describe, expect, it } from 'vitest';
import { LINEAGE_DEPTH, deepenShallowCheckout } from '../deepenCheckout.mjs';

/**
 * A stand-in git that answers each command from `outcomes` (keyed by the first
 * argument) and records every invocation, so a test can assert both what git was
 * asked and what it was NOT asked.
 */
function recordingGit(outcomes) {
  const calls = [];

  const runGit = (args) => {
    calls.push(args.join(' '));
    const outcome = outcomes[args[0]] ?? { ok: false, stdout: '', stderr: 'unexpected command' };
    return { stdout: '', stderr: '', ...outcome };
  };

  return { runGit, calls };
}

/** Collects the runner's log lines into one string, the way a CI log reads. */
function recordingLog() {
  const lines = [];
  return { log: (line) => lines.push(line), read: () => lines.join('\n') };
}

const IS_SHALLOW = { ok: true, stdout: 'true\n' };
const IS_NOT_SHALLOW = { ok: true, stdout: 'false\n' };
const HAS_ANCESTORS = { ok: true, stdout: '201\n' };
const FETCH_SUCCEEDED = { ok: true, stdout: '' };

describe('deepenShallowCheckout', () => {
  it('leaves a full clone completely alone - the probe is the only git it runs', () => {
    const git = recordingGit({ 'rev-parse': IS_NOT_SHALLOW });
    const logger = recordingLog();

    const outcome = deepenShallowCheckout({ runGit: git.runGit, log: logger.log });

    expect(outcome).toBe('already-deep');
    expect(git.calls).toEqual(['rev-parse --is-shallow-repository']);
    expect(logger.read()).toBe('');
  });

  it('deepens a shallow clone by the number of commits the CLI actually transmits', () => {
    const git = recordingGit({
      'rev-parse': IS_SHALLOW,
      fetch: FETCH_SUCCEEDED,
      'rev-list': HAS_ANCESTORS,
    });
    const logger = recordingLog();

    const outcome = deepenShallowCheckout({ runGit: git.runGit, log: logger.log });

    expect(outcome).toBe('deepened');
    expect(git.calls).toContain('fetch --deepen=200 --quiet');
    expect(logger.read()).toContain('Shallow checkout detected');
  });

  // The depth is not a free choice: the CLI caps every ancestry window it sends
  // at ANCESTOR_LIMIT, so fetching a different number either wastes history or
  // truncates the window the server inherits from.
  it('uses the same depth the CLI caps its ancestry windows at', () => {
    expect(LINEAGE_DEPTH).toBe(200);
  });

  it('runs for every event, not just pull requests - a push road needs lineage too', () => {
    const git = recordingGit({
      'rev-parse': IS_SHALLOW,
      fetch: FETCH_SUCCEEDED,
      'rev-list': HAS_ANCESTORS,
    });

    // No GITHUB_EVENT_NAME, no PR context, nothing event-shaped is consulted.
    expect(deepenShallowCheckout({ runGit: git.runGit, log: () => {} })).toBe('deepened');
  });

  it('warns loudly and continues when the deepen is rejected (persist-credentials: false)', () => {
    const git = recordingGit({
      'rev-parse': IS_SHALLOW,
      fetch: { ok: false, stderr: 'could not read Username for https://github.com' },
    });
    const logger = recordingLog();

    const outcome = deepenShallowCheckout({ runGit: git.runGit, log: logger.log });
    const written = logger.read();

    expect(outcome).toBe('deepen-failed');
    // Names what degrades, both remedies, and that the run goes on regardless.
    expect(written).toContain('::warning title=Sherlo::');
    expect(written).toContain('could not read Username');
    expect(written).toContain('cannot inherit a baseline');
    expect(written).toContain('persist-credentials');
    expect(written).toContain('fetch-depth: 0');
    expect(written).toContain('This run continues');
  });

  // GitHub cuts a workflow-command line at its first newline, and git's failure
  // text is routinely several lines - so an un-flattened annotation would hide
  // the cause it exists to report.
  it('keeps the annotation on one line even when git fails across several', () => {
    const git = recordingGit({
      'rev-parse': IS_SHALLOW,
      fetch: {
        ok: false,
        stderr: 'fatal: could not read Username\nfatal: authentication failed\n',
      },
    });
    const logger = recordingLog();

    deepenShallowCheckout({ runGit: git.runGit, log: logger.log });
    const annotation = logger
      .read()
      .split('\n')
      .find((line) => line.startsWith('::warning'));

    expect(annotation).toContain('could not read Username');
    expect(annotation).toContain('authentication failed');
    expect(annotation).toContain('fetch-depth: 0');
  });

  it('warns when the deepen reports success but HEAD still stands alone', () => {
    const git = recordingGit({
      'rev-parse': IS_SHALLOW,
      fetch: FETCH_SUCCEEDED,
      'rev-list': { ok: true, stdout: '1\n' },
    });
    const logger = recordingLog();

    const outcome = deepenShallowCheckout({ runGit: git.runGit, log: logger.log });

    expect(outcome).toBe('no-lineage-gained');
    expect(logger.read()).toContain('::warning title=Sherlo::');
  });

  // A repository longer than the deepen is still shallow at its NEW boundary -
  // that is a successful repair, and warning about it would fire on almost every
  // real run. Ancestry, not the shallow flag, is what the check reads.
  it('treats a still-shallow repository with recovered ancestry as repaired', () => {
    const git = recordingGit({
      'rev-parse': IS_SHALLOW,
      fetch: FETCH_SUCCEEDED,
      'rev-list': HAS_ANCESTORS,
    });
    const logger = recordingLog();

    expect(deepenShallowCheckout({ runGit: git.runGit, log: logger.log })).toBe('deepened');
    expect(logger.read()).not.toContain('::warning');
  });

  it('does nothing at all outside a git repository', () => {
    const git = recordingGit({ 'rev-parse': { ok: false, stderr: 'not a git repository' } });
    const logger = recordingLog();

    expect(deepenShallowCheckout({ runGit: git.runGit, log: logger.log })).toBe('not-a-repository');
    expect(git.calls).toEqual(['rev-parse --is-shallow-repository']);
    expect(logger.read()).toBe('');
  });
});
