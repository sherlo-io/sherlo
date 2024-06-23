import * as core from '@actions/core';
import * as github from '@actions/github';

import { main } from '@sherlo/cli';

async function run(): Promise<void> {
  try {
    const projectRoot = getOptionalInput('projectRoot');
    const config = getOptionalInput('config');
    const android = getOptionalInput('android');
    const overrideCommitName = getOptionalInput('commitName');
    const ios = getOptionalInput('ios');
    const async = getOptionalInput('async') === 'true';
    const asyncBuildIndexString = getOptionalInput('asyncBuildIndex');
    const asyncBuildIndex = asyncBuildIndexString ? Number(asyncBuildIndexString) : undefined;

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

    if (overrideCommitName) {
      gitInfo.commitName = overrideCommitName;
    }

    const { buildIndex, url } = await main({
      android,
      ios,
      config,
      async,
      asyncBuildIndex,
      projectRoot,
      token: emptyStringToUndefined(process.env.SHERLO_TOKEN), // Action returns an empty string if not defined
      gitInfo,
    });

    core.setOutput('buildIndex', buildIndex);
    core.setOutput('url', url);
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

function getOptionalInput(name: string): string | undefined {
  const value = core.getInput(name, { required: false });
  return emptyStringToUndefined(value);
}

function emptyStringToUndefined(input?: string): string | undefined {
  return input === '' ? undefined : input;
}

run();
