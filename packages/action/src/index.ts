import * as core from '@actions/core';
import { localBuilds, expoUpdate, expoCloudBuilds } from '@sherlo/cli';
import * as github from '@actions/github';
import { Build } from '@sherlo/api-types';

type CommandOptions = {
  android?: string;
  ios?: string;
  token?: string;
  config?: string;
  projectRoot?: string;
  branch?: string;
  easBuildScriptName?: string;
  waitForEasBuild?: boolean;
  gitInfo?: Build['gitInfo'];
};

async function run(): Promise<void> {
  try {
    const command = core.getInput('command', { required: true });
    const overrideCommitName = getOptionalInput('commitName');

    const options: CommandOptions = {
      android: getOptionalInput('android'),
      ios: getOptionalInput('ios'),
      config: getOptionalInput('config'),
      projectRoot: getOptionalInput('project-root'),
      token: emptyStringToUndefined(process.env.SHERLO_TOKEN),
    };

    let commandFunction;
    switch (command) {
      case 'local-builds':
        commandFunction = localBuilds;
        break;

      case 'expo-update':
        options.branch = getOptionalInput('branch');
        commandFunction = expoUpdate;
        break;

      case 'expo-cloud-builds':
        options.easBuildScriptName = getOptionalInput('eas-build-script-name');
        options.waitForEasBuild = core.getBooleanInput('wait-for-eas-build');
        commandFunction = expoCloudBuilds;
        break;

      default:
        throw new Error(`Unsupported command: ${command}`);
    }

    options.gitInfo = getGitInfo(overrideCommitName);

    // We cast options as any to leverage validation in @sherlo/cli
    const { url } = await commandFunction(options as any);

    core.setOutput('url', url);
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

/******************************************************************************/

function getGitInfo(overrideCommitName?: string) {
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

  return gitInfo;
}

function getOptionalInput(name: string): string | undefined {
  const value = core.getInput(name, { required: false });
  return emptyStringToUndefined(value);
}

function emptyStringToUndefined(input?: string): string | undefined {
  return input === '' ? undefined : input;
}

run();
