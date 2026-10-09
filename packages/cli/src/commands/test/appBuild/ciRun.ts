/**
 * WHICH CI RUN THIS JOB BELONGS TO - the key the two jobs of a split run share, so the server joins
 * their builds into one test (`sherlo test --platform android` on Linux, `--platform ios` on a Mac).
 *
 * Read from the CI service's own variables, the id every job of ONE pipeline run shares. Never the
 * attempt number: re-running a failed job keeps the run id and bumps the attempt, and a key with the
 * attempt in it would strand the re-run job in a test of its own (research of 2026-10-07, every
 * service's own documentation). The server takes the newer attempt's build for that platform.
 *
 *     GitHub Actions   GITHUB_REPOSITORY + GITHUB_RUN_ID
 *     GitLab CI        CI_PIPELINE_ID (unique across the whole instance)
 *     CircleCI         CIRCLE_WORKFLOW_WORKSPACE_ID (the workflow id changes on a re-run)
 *     Bitrise          BITRISEIO_PIPELINE_ID
 *     Buildkite        BUILDKITE_BUILD_ID
 *     Azure Pipelines  SYSTEM_COLLECTIONID + BUILD_BUILDID
 *     Jenkins          BUILD_TAG
 *     Bitbucket        BITBUCKET_PIPELINE_UUID
 *     Travis CI        TRAVIS_REPO_SLUG + TRAVIS_BUILD_ID
 *
 * `--run-id` (or SHERLO_RUN_ID) wins over all of them - EAS Workflows and Codemagic share no run id
 * between their jobs, so they pass one. With none of them there is no join: a commit alone would
 * merge two different runs of one commit, so the job's build stays a test of its own.
 */

/** The run id this job's CI service gives every job of one run, with the service's name in front. */
export function ciRunKey(env: NodeJS.ProcessEnv, runIdFlag?: string): string | null {
  const explicit = runIdFlag ?? env.SHERLO_RUN_ID;
  if (explicit) return `run:${explicit}`;

  const joined = (...values: Array<string | undefined>): string | null =>
    values.every(Boolean) ? values.join('/') : null;

  if (env.GITHUB_ACTIONS === 'true') return prefixed('github', joined(env.GITHUB_REPOSITORY, env.GITHUB_RUN_ID));
  if (env.GITLAB_CI) return prefixed('gitlab', joined(env.CI_PIPELINE_ID));
  if (env.CIRCLECI) return prefixed('circleci', joined(env.CIRCLE_WORKFLOW_WORKSPACE_ID));
  if (env.BITRISE_IO) return prefixed('bitrise', joined(env.BITRISEIO_PIPELINE_ID));
  if (env.BUILDKITE) return prefixed('buildkite', joined(env.BUILDKITE_BUILD_ID));
  if (env.TF_BUILD) return prefixed('azure', joined(env.SYSTEM_COLLECTIONID, env.BUILD_BUILDID));
  if (env.JENKINS_URL) return prefixed('jenkins', joined(env.BUILD_TAG));
  if (env.BITBUCKET_BUILD_NUMBER) return prefixed('bitbucket', joined(env.BITBUCKET_PIPELINE_UUID));
  if (env.TRAVIS) return prefixed('travis', joined(env.TRAVIS_REPO_SLUG, env.TRAVIS_BUILD_ID));

  return null;
}

/** The run id alone, as the waiting line shows it to the developer. */
export function ciRunIdOf(key: string): string {
  return key.slice(Math.max(key.lastIndexOf('/'), key.indexOf(':')) + 1);
}

function prefixed(service: string, id: string | null): string | null {
  return id ? `${service}:${id}` : null;
}
