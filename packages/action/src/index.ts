import * as core from '@actions/core';
import * as github from '@actions/github';

import { uploadAndTest } from '@sherlo/cli';

async function run(): Promise<void> {
  try {
    const android: string = core.getInput('android', { required: false });
    const ios: string = core.getInput('ios', { required: false });
    const config: string = core.getInput('config', { required: false });

    const commitName = github.context.payload.head_commit.message;
    const commitHash = github.context.sha;

    let branchName;
    // Check if the event that triggered the workflow is a pull request or a push
    if (github.context.payload.pull_request) {
      // For pull requests, the branch name is stored differently
      branchName = github.context.payload.pull_request.head.ref;
    } else {
      // For push events, the branch reference is split to get the branch name
      branchName = github.context.ref.split('/').pop();
    }

    await uploadAndTest({
      android,
      ios,
      config,
      token: process.env.SHERLO_TOKEN || undefined,
      gitInfo: {
        commitName,
        commitHash,
        branchName,
      },
    });
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
