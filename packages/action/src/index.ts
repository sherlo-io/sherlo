import * as core from '@actions/core';
import * as github from '@actions/github';

import { uploadAndTest } from '@sherlo/cli';

async function run(): Promise<void> {
  try {
    const android: string = core.getInput('android', { required: false });
    const ios: string = core.getInput('ios', { required: false });
    const config: string = core.getInput('config', { required: false });
    const projectRoot: string = core.getInput('projectRoot', { required: false });
    const asyncUploadBuildIndex: number = Number(
      core.getInput('asyncUploadBuildIndex', {
        required: false,
      })
    );
    const asyncUpload: boolean = core.getInput('asyncUpload', { required: false }) === 'true';

    const { context } = github;

    let gitInfo = {
      commitHash: context?.sha || 'unknown',
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
        console.log(JSON.stringify(context, null, 2));
        break;
    }

    const { buildIndex, url } = await uploadAndTest({
      android,
      ios,
      config,
      asyncUpload,
      asyncUploadBuildIndex,
      projectRoot,
      token: process.env.SHERLO_TOKEN || undefined,
      gitInfo,
    });

    core.setOutput('buildIndex', buildIndex);
    core.setOutput('url', url);
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
