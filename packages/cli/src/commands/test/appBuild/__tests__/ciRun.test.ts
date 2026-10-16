import { describe, expect, it } from 'vitest';
import { ciRunKey } from '../ciRun';

describe('the jobs of one CI run find the same join key', () => {
  it('reads the join key of each CI service from the run id all its jobs share', () => {
    const keyOf = (env: Record<string, string>) => ciRunKey(env);

    expect(keyOf({ GITLAB_CI: 'true', CI_PIPELINE_ID: '77' })).toBe('gitlab:77');
    expect(keyOf({ CIRCLECI: 'true', CIRCLE_WORKFLOW_WORKSPACE_ID: 'w1' })).toBe('circleci:w1');
    expect(keyOf({ BITRISE_IO: 'true', BITRISEIO_PIPELINE_ID: 'p1' })).toBe('bitrise:p1');
    expect(keyOf({ BUILDKITE: 'true', BUILDKITE_BUILD_ID: 'b1' })).toBe('buildkite:b1');
    expect(keyOf({ TF_BUILD: 'True', SYSTEM_COLLECTIONID: 'c1', BUILD_BUILDID: '9' })).toBe(
      'azure:c1/9'
    );
    expect(keyOf({ JENKINS_URL: 'http://j', BUILD_TAG: 'jenkins-job-3' })).toBe(
      'jenkins:jenkins-job-3'
    );
    expect(keyOf({ BITBUCKET_BUILD_NUMBER: '4', BITBUCKET_PIPELINE_UUID: '{u}' })).toBe(
      'bitbucket:{u}'
    );
    expect(keyOf({ TRAVIS: 'true', TRAVIS_REPO_SLUG: 'o/r', TRAVIS_BUILD_ID: '5' })).toBe(
      'travis:o/r/5'
    );
  });

  it('reads the GitHub join key as the repository and the run id, never the attempt', () => {
    const firstAttempt = {
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'acme/app',
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '1',
    };

    expect(ciRunKey(firstAttempt)).toBe('github:acme/app/123');
    expect(ciRunKey({ ...firstAttempt, GITHUB_RUN_ATTEMPT: '2' })).toBe(ciRunKey(firstAttempt));
  });

  it("--run-id, then SHERLO_RUN_ID, wins over the CI service's own run id", () => {
    const github = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'acme/app', GITHUB_RUN_ID: '123' };

    expect(ciRunKey({ ...github, SHERLO_RUN_ID: 'from-env' })).toBe('run:from-env');
    expect(ciRunKey({ ...github, SHERLO_RUN_ID: 'from-env' }, 'from-flag')).toBe('run:from-flag');
  });

  it('with no CI run id and no --run-id there is no join key', () => {
    expect(ciRunKey({})).toBeNull();
    // A service that is detected but gives no run id is no key either.
    expect(ciRunKey({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'acme/app' })).toBeNull();
  });
});
