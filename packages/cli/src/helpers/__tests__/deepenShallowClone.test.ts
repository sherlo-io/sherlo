import fs from 'fs';
import path from 'path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import deepenShallowClone from '../deepenShallowClone';
import { ANCESTOR_LIMIT } from '../getGitInfo';
import runShellCommand from '../runShellCommand';
import fakeGit from './support/fakeGit';
import GitFixture from './support/gitFixture';
import { refusingHostConfig } from './support/gitInfoRepositories';

/**
 * A bare origin with more commits than the tool transmits, and a depth 1 file:// clone of it. A
 * refused fetch is the origin's pack-objects hook set to a failing program, handed to the git the
 * origin runs through the environment.
 */

const ORIGIN_COMMITS = ANCESTOR_LIMIT + 20;
const cleanups: Array<() => void> = [];
const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
  while (cleanups.length) cleanups.pop()!();
});

/** The bare origin, built once: every case clones it. */
let origin: GitFixture;

beforeAll(() => {
  const source = GitFixture.create();
  source.buildHistory(
    Array.from({ length: ORIGIN_COMMITS }, (_, index) => ({
      mark: `c${index}`,
      branch: 'main',
      message: `commit ${index}`,
      parents: index === 0 ? [] : [`c${index - 1}`],
    }))
  );
  origin = source.bareClone();
  source.cleanup();
});

afterAll(() => origin.cleanup());

function shallowCloneOfDeepOrigin(): GitFixture {
  const clone = origin.shallowClone(1, 'main');
  cleanups.push(() => clone.cleanup());
  return clone;
}

function commitsReachable(clone: GitFixture): number {
  return Number(clone.git(['rev-list', '--count', 'HEAD']));
}

describe('the tool deepens a shallow clone itself', () => {
  it('deepens a shallow clone by the number of commits the CLI actually transmits', async () => {
    const clone = shallowCloneOfDeepOrigin();
    expect(commitsReachable(clone)).toBe(1);

    const result = await deepenShallowClone(runShellCommand, clone.dir, ANCESTOR_LIMIT);

    expect(result).toEqual({ kind: 'deepened' });
    expect(commitsReachable(clone)).toBe(1 + ANCESTOR_LIMIT);
  });

  it("returns git's reason when the fetch is refused, and the push goes on", async () => {
    const clone = shallowCloneOfDeepOrigin();
    const globalConfig = refusingHostConfig();
    cleanups.push(() => fs.rmSync(path.dirname(globalConfig), { recursive: true, force: true }));
    process.env.GIT_CONFIG_GLOBAL = globalConfig;

    const result = await deepenShallowClone(runShellCommand, clone.dir, ANCESTOR_LIMIT);

    expect(result.kind).toBe('refused');
    // Git prints its refusal over several lines; the reason is folded onto one.
    expect(result.kind === 'refused' && result.reason.length).toBeGreaterThan(0);
    expect(result.kind === 'refused' && result.reason).not.toMatch(/\n/);
    expect(commitsReachable(clone)).toBe(1);
  });

  it('fetches with terminal prompts off', async () => {
    const clone = shallowCloneOfDeepOrigin();
    const { envLog, remove } = fakeGit('fetch');
    cleanups.push(remove);

    await deepenShallowClone(runShellCommand, clone.dir, ANCESTOR_LIMIT);

    expect(fs.readFileSync(envLog, 'utf8').trim()).toBe('0|false');
  });

  it('leaves a full clone untouched', async () => {
    const source = GitFixture.create();
    source.commitMany(['one', 'two']);
    cleanups.push(() => source.cleanup());

    expect(await deepenShallowClone(runShellCommand, source.dir, ANCESTOR_LIMIT)).toEqual({
      kind: 'untouched',
    });
  });
});
