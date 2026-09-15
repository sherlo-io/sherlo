/**
 * THE POSE READER (sherlo / Drawing for a plan).
 *
 * A pose is written by hand, so the reader's job is not only to refuse a bad one - it is to
 * refuse it ONCE, naming everything wrong with it, so the person fixing it makes one pass rather
 * than one pass per mistake. Every case below is about that: what counts as a problem, and that
 * all of them arrive together.
 */
import { describe, expect, it } from 'vitest';
import { PoseRefusal, readPose, readPoseDocument } from '../readPose';

/** A pose with nothing wrong with it - the thing every case below breaks in exactly one way. */
function validPose(): Record<string, unknown> {
  return {
    pose: 1,
    argv: ['view', '7'],
    files: { 'sherlo.config.json': { devices: [] } },
    env: { SKIP_INTRO: 'true' },
    git: { branch: 'main', commit: '4f3a9c1d', dirty: false },
    bundles: {},
    api: [{ call: 'getBuildStatus', with: { buildIndex: 7 }, answer: { runStatus: 'finished' } }],
    masks: {},
  };
}

/** The problems a document is refused with, or a failure saying it was accepted. */
function problemsOf(document: unknown): string[] {
  try {
    readPose(document);
  } catch (error) {
    if (error instanceof PoseRefusal) return error.problems;
    throw error;
  }

  throw new Error('the reader ACCEPTED this document - the case below is proving nothing');
}

describe('reading a CommandPose', () => {
  it('reads a pose with nothing wrong with it', () => {
    expect(readPose(validPose())).toMatchObject({ pose: 1, argv: ['view', '7'] });
  });

  it('a pose with a missing field, an unknown key or a value of the wrong type is refused naming every problem at once', () => {
    const broken = validPose();
    delete broken.git; // missing
    broken.env = { SKIP_INTRO: true }; // wrong type, one level down
    broken.argv = 'view 7'; // wrong type
    (broken as Record<string, unknown>).ambient = { skipIntro: true }; // unknown key

    const problems = problemsOf(broken);

    // ALL FOUR, in ONE refusal. A reader that stopped at the first would make fixing a
    // hand-written pose one round trip per mistake.
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toContain('`argv`');
    expect(problems.join('\n')).toContain('`env["SKIP_INTRO"]`');
    expect(problems.join('\n')).toContain('`git`');
    expect(problems.join('\n')).toContain('`ambient`: unknown field');

    // And the one message a person reads carries every one of them.
    try {
      readPose(broken);
    } catch (error) {
      for (const problem of problems) expect((error as Error).message).toContain(problem);
    }
  });

  it('names an unknown field BY NAME rather than ignoring it', () => {
    const withExtra = { ...validPose(), transcript: 'a name that was never a field' };

    expect(problemsOf(withExtra)).toEqual(['`transcript`: unknown field']);
  });

  it('refuses a version it does not know', () => {
    expect(problemsOf({ ...validPose(), pose: 2 }).join()).toContain('knows version 1');
  });

  it('refuses a `git` that is neither the two words nor the three facts', () => {
    expect(problemsOf({ ...validPose(), git: 'missing' }).join()).toContain('`git`');
    expect(problemsOf({ ...validPose(), git: { branch: 'main', commit: 'abc' } }).join()).toContain(
      '`git`.dirty'
    );
  });

  it('accepts the two words a failed git read is stated with', () => {
    expect(readPose({ ...validPose(), git: 'none' }).git).toBe('none');
    expect(readPose({ ...validPose(), git: 'unavailable' }).git).toBe('unavailable');
  });

  it('refuses bundles supplied to a command that never reaches a bundler', () => {
    const bundlesOnAView = {
      ...validPose(),
      bundles: {
        android: {
          bundlePath: 'bundle.android.js',
          bundleSizeMb: 4.29,
          bundleFormat: 'plain-js',
          bundler: 'expo',
          assets: [],
          storyClosureKeys: [],
        },
      },
    };

    expect(problemsOf(bundlesOnAView).join()).toContain('never reaches a bundler');
  });

  it('accepts the same bundles on the command that does bundle', () => {
    const bundlesOnATest = {
      ...validPose(),
      argv: ['test', '--dry-run'],
      api: [],
      bundles: {
        android: {
          bundlePath: 'bundle.android.js',
          bundleSizeMb: 4.29,
          bundleFormat: 'plain-js',
          bundler: 'expo',
          assets: [],
          storyClosureKeys: [],
        },
      },
    };

    expect(Object.keys(readPose(bundlesOnATest).bundles)).toEqual(['android']);
  });

  it('refuses an operation the contract does not name, and says which it does', () => {
    const unknownCall = {
      ...validPose(),
      api: [{ call: 'checkStagedGate', with: {}, answer: { outcome: 'fast' } }],
    };

    const said = problemsOf(unknownCall).join();
    expect(said).toContain('checkStagedGate');
    expect(said).toContain('`getBuildStatus`');
  });

  it('refuses an answer whose shape the backend could not send', () => {
    const impossible = {
      ...validPose(),
      api: [{ call: 'getBuildStatus', with: { buildIndex: 7 }, answer: { runStatus: 'done' } }],
    };

    expect(problemsOf(impossible).join()).toContain('runStatus');
  });

  it('accepts the error the server sends, for any call', () => {
    const serverRefused = {
      ...validPose(),
      api: [{ call: 'getBuildStatus', with: { buildIndex: 7 }, answer: { error: 'HTTP 403' } }],
    };

    expect(readPose(serverRefused).api).toHaveLength(1);
  });

  it('accepts `null` only where the wire can send it', () => {
    const buildIsNotThere = {
      ...validPose(),
      api: [{ call: 'getBuildStatus', with: { buildIndex: 99 }, answer: null }],
    };
    expect(readPose(buildIsNotThere).api).toHaveLength(1);

    const teamIsNotThere = {
      ...validPose(),
      argv: ['team', 'list'],
      api: [{ call: 'listTeams', with: {}, answer: null }],
    };
    expect(problemsOf(teamIsNotThere).join()).toContain('only `getBuildStatus` answers `null`');
  });

  it('a document that is not JSON is refused the same way as one that is the wrong shape', () => {
    expect(() => readPoseDocument('{ not json')).toThrow(PoseRefusal);
    expect(() => readPoseDocument('{ not json')).toThrow('not valid JSON');
  });
});
