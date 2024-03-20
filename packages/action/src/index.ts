import * as core from '@actions/core';
import * as github from '@actions/github';

import { uploadAndTest } from '@sherlo/cli';

async function run(): Promise<void> {
  try {
    const android: string = core.getInput('android', { required: false });
    const ios: string = core.getInput('ios', { required: false });
    const config: string = core.getInput('config', { required: false });

    // The GITHUB_TOKEN is automatically available as an environment variable in all runner environments
    console.log(`GITHUB_TOKEN: ${process.env.GITHUB_TOKEN}`);
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN!);

    const { context } = github;
    const commitSha = context.sha; // or any other SHA you're interested in

    // Fetch commit information using the Octokit library
    const { data: commitData } = await octokit.rest.git.getCommit({
      owner: context.repo.owner,
      repo: context.repo.repo,
      commit_sha: commitSha,
    });

    const commitMessage = commitData.message;
    console.log(`Commit Message: ${commitMessage}`);

    await uploadAndTest({
      android,
      ios,
      config,
      token: process.env.SHERLO_TOKEN || undefined,
      // gitInfo: {
      //   commitName:,
      //   commitHash,
      //   branchName,
      // },
    });
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
