import { Command } from 'commander';
import { version } from '../package.json';
import { localBuilds, expoCloudBuilds, easBuildOnComplete, expoUpdates } from './commands';
import {
  ANDROID_OPTION,
  CHANNEL_OPTION,
  CONFIG_OPTION,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  EAS_UPDATE_JSON_OUTPUT_OPTION,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATES_COMMAND,
  LOCAL_BUILDS_COMMAND,
  IOS_OPTION,
  PLATFORM_LABEL,
  PROFILE_OPTION,
  PROJECT_ROOT_OPTION,
  TOKEN_OPTION,
  WAIT_FOR_EAS_BUILD_OPTION,
} from './constants';
import { printHeader } from './helpers';
async function start() {
  try {
    const program = new Command();

    const sharedOptions = {
      [ANDROID_OPTION]: [
        `--${ANDROID_OPTION} <path>`,
        `Path to the ${PLATFORM_LABEL.android} build in .apk format`,
      ],
      [IOS_OPTION]: [
        `--${IOS_OPTION} <path>`,
        `Path to the ${PLATFORM_LABEL.ios} build in .app (or compressed .tar.gz / .tar) format`,
      ],
      [TOKEN_OPTION]: [`--${TOKEN_OPTION} <token>`, 'Authentication token for the project'],
      [CONFIG_OPTION]: [`--${CONFIG_OPTION} <path>`, 'Path to the config file'],
      [PROJECT_ROOT_OPTION]: [
        `--${PROJECT_ROOT_OPTION} <path>`,
        'Root directory of the React Native project',
      ],
    } as const;

    program
      .name('sherlo')
      .version(version, '--version', 'Output the version number')
      .description('Sherlo CLI for automating visual testing of React Native Storybook');

    program
      .command(LOCAL_BUILDS_COMMAND)
      .description('Run Sherlo with locally available builds')
      .option(...sharedOptions[ANDROID_OPTION])
      .option(...sharedOptions[IOS_OPTION])
      .option(...sharedOptions[TOKEN_OPTION])
      .option(...sharedOptions[CONFIG_OPTION])
      .option(...sharedOptions[PROJECT_ROOT_OPTION])
      .action(async (options) => {
        await localBuilds(options);
      });

    program
      .command(EXPO_CLOUD_BUILDS_COMMAND)
      .description('Run Sherlo with builds created in the Expo cloud')
      .option(
        `--${EAS_BUILD_SCRIPT_NAME_OPTION} <script_name>`,
        'Name of the script in package.json that triggers `eas build`'
      )
      .option(`--${WAIT_FOR_EAS_BUILD_OPTION}`, 'Wait mode for user-triggered `eas build`')
      .option(...sharedOptions[TOKEN_OPTION])
      .option(...sharedOptions[CONFIG_OPTION])
      .option(...sharedOptions[PROJECT_ROOT_OPTION])
      .action(async (options) => {
        await expoCloudBuilds(options);
      });

    program
      .command(EAS_BUILD_ON_COMPLETE_COMMAND)
      .description(
        `Process completion of Expo cloud builds; required for \`sherlo ${EXPO_CLOUD_BUILDS_COMMAND}\``
      )
      .option(
        `--${PROFILE_OPTION} <profile_name>`,
        `EAS build profile matching the one used in \`sherlo ${EXPO_CLOUD_BUILDS_COMMAND}\`` // TODO: EAS build profile used with the `eas build` command
      )
      .action(easBuildOnComplete);

    program
      .command(EXPO_UPDATES_COMMAND)
      .description('Run Sherlo with Expo updates')
      .option(
        `--${CHANNEL_OPTION} <channel_name>`,
        'Name of the Expo update channel to retrieve the latest update'
      )
      .option(
        `--${EAS_UPDATE_JSON_OUTPUT_OPTION} <json_output>`,
        'JSON output from the `eas update --json` command'
      )
      .option(...sharedOptions[ANDROID_OPTION])
      .option(...sharedOptions[IOS_OPTION])
      .option(...sharedOptions[TOKEN_OPTION])
      .option(...sharedOptions[CONFIG_OPTION])
      .option(...sharedOptions[PROJECT_ROOT_OPTION])
      .action(async (options) => {
        await expoUpdates(options);
      });

    if (process.argv.length === 2) {
      printHeader();
      console.log('Choose a Sherlo command. Use --help for more information.');
      process.exit(0);
    }

    await program.parseAsync(process.argv);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(e.code || 1);
  }
}

export default start;
