import * as core from '@actions/core';
import * as github from '@actions/github';

import { uploadAndTest } from '@sherlo/cli';

async function run(): Promise<void> {
  try {
    const android: string = core.getInput('android', { required: false });
    const ios: string = core.getInput('ios', { required: false });
    const config: string = core.getInput('config', { required: false });

    const { context } = github;
    console.log(JSON.stringify(context, null, 2));

    let gitInfo = {
      commitHash: context?.sha.slice(0, 7) || 'unknown',
      branchName: context?.ref.split('refs/heads/')[1] || 'unknown',
      commitName: 'unknown',
    };

    switch (context?.eventName) {
      case 'push':
        const commitName = context?.payload?.head_commit?.message;

        if (commitName) {
          gitInfo = {
            ...gitInfo,
            commitName,
          };
        }
        break;
      default:
        break;
    }

    console.log('gitInfo', gitInfo);

    const test = true;
    if (test) return;

    await uploadAndTest({
      android,
      ios,
      config,
      token: process.env.SHERLO_TOKEN || undefined,
      gitInfo,
    });
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
