import * as core from '@actions/core';
import { Build } from '@sherlo/api-types';
import { commands, constants } from 'sherlo';
import { getGitInfo } from './getGitInfo';

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
      android: getOptionalInput(constants.ANDROID_OPTION),
      ios: getOptionalInput(constants.IOS_OPTION),
      config: getOptionalInput(constants.CONFIG_OPTION),
      projectRoot: getOptionalInput(constants.PROJECT_ROOT_OPTION),
      token: emptyStringToUndefined(process.env.SHERLO_TOKEN),
    };

    let commandFunction;
    switch (command) {
      case constants.LOCAL_BUILDS_COMMAND:
        commandFunction = commands.localBuilds;
        break;

      case constants.EXPO_UPDATE_COMMAND:
        options.branch = getOptionalInput(constants.BRANCH_OPTION);
        commandFunction = commands.expoUpdate;
        break;

      case constants.EXPO_CLOUD_BUILDS_COMMAND:
        options.easBuildScriptName = getOptionalInput(constants.EAS_BUILD_SCRIPT_NAME_OPTION);
        options.waitForEasBuild = core.getBooleanInput(constants.WAIT_FOR_EAS_BUILD_OPTION);
        commandFunction = commands.expoCloudBuilds;
        break;

      default:
        throw new Error(`Unsupported command: ${command}`);
    }

    options.gitInfo = getGitInfo(overrideCommitName);

    // We cast options as any to leverage validation in Sherlo CLI
    const { url } = await commandFunction(options as any);

    core.setOutput('url', url);
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

/******************************************************************************/

function getOptionalInput(name: string): string | undefined {
  const value = core.getInput(name, { required: false });
  return emptyStringToUndefined(value);
}

function emptyStringToUndefined(input?: string): string | undefined {
  return input === '' ? undefined : input;
}

run();
