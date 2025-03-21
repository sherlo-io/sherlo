import { Command } from 'commander';
import { version } from '../package.json';
import { localBuilds, expoCloudBuilds, easBuildOnComplete, expoUpdate, init } from './commands';
import {
  ANDROID_OPTION,
  BRANCH_OPTION,
  CONFIG_OPTION,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_PROJECT_ROOT,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATE_COMMAND,
  LOCAL_BUILDS_COMMAND,
  IOS_OPTION,
  PLATFORM_LABEL,
  PROFILE_OPTION,
  PROJECT_ROOT_OPTION,
  TOKEN_OPTION,
  WAIT_FOR_EAS_BUILD_OPTION,
  INIT_COMMAND,
} from './constants';
import { reporting } from './helpers';

// Disable all Node.js warnings
process.removeAllListeners('warning');

async function start() {
  try {
    reporting.init();

    const program = new Command();

    const sharedOptions = {
      [ANDROID_OPTION]: [
        `--${ANDROID_OPTION} <path>`,
        `Path to ${PLATFORM_LABEL.android} build (.apk)`,
      ],
      [IOS_OPTION]: [
        `--${IOS_OPTION} <path>`,
        `Path to ${PLATFORM_LABEL.ios} build (.app, .tar.gz or .tar)`,
      ],
      [TOKEN_OPTION]: [`--${TOKEN_OPTION} <token>`, 'Authentication token for the project'],
      [CONFIG_OPTION]: [
        `--${CONFIG_OPTION} <path>`,
        `Path to the config file (default: ${DEFAULT_CONFIG_FILENAME})`,
      ],
      [PROJECT_ROOT_OPTION]: [
        `--${PROJECT_ROOT_OPTION} <path>`,
        `Path to the root directory of your project (default: ${DEFAULT_PROJECT_ROOT})`,
      ],
    } as const;

    const setReportingContext = (command: string, options: Record<string, unknown>) => {
      reporting.setContext('commandContext', { command, options });
    };

    program
      .name('sherlo')
      .version(version, '--version', 'Output the version number')
      .description('Sherlo CLI for React Native Storybook visual testing');

    program
      .command(LOCAL_BUILDS_COMMAND)
      .description('Test builds')
      .option(...sharedOptions[ANDROID_OPTION])
      .option(...sharedOptions[IOS_OPTION])
      .option(...sharedOptions[TOKEN_OPTION])
      .option(...sharedOptions[CONFIG_OPTION])
      .option(...sharedOptions[PROJECT_ROOT_OPTION])
      .action(async (options) => {
        setReportingContext(LOCAL_BUILDS_COMMAND, options);
        await localBuilds(options);
      });

    program
      .command(EXPO_UPDATE_COMMAND)
      .description('Test builds with Expo Update')
      .option(
        `--${BRANCH_OPTION} <branch>`,
        'Name of the EAS Update branch to fetch the latest update from'
      )
      // .option(
      //   `--${EAS_UPDATE_JSON_OUTPUT_OPTION} <json_output>`,
      //   'JSON output from the `eas update --json` command'
      // )
      .option(...sharedOptions[ANDROID_OPTION])
      .option(...sharedOptions[IOS_OPTION])
      .option(...sharedOptions[TOKEN_OPTION])
      .option(...sharedOptions[CONFIG_OPTION])
      .option(...sharedOptions[PROJECT_ROOT_OPTION])
      .action(async (options) => {
        setReportingContext(EXPO_UPDATE_COMMAND, options);
        await expoUpdate(options);
      });

    program
      .command(EXPO_CLOUD_BUILDS_COMMAND)
      .description('Test builds from Expo cloud (EAS)')
      .option(
        `--${EAS_BUILD_SCRIPT_NAME_OPTION} <name>`,
        'Name of the package.json script that triggers EAS build'
      )
      .option(
        `--${WAIT_FOR_EAS_BUILD_OPTION}`,
        'Start waiting for EAS build to be triggered manually'
      )
      .option(...sharedOptions[TOKEN_OPTION])
      .option(...sharedOptions[CONFIG_OPTION])
      .option(...sharedOptions[PROJECT_ROOT_OPTION])
      .action(async (options) => {
        setReportingContext(EXPO_CLOUD_BUILDS_COMMAND, options);
        await expoCloudBuilds(options);
      });

    program
      .command(EAS_BUILD_ON_COMPLETE_COMMAND)
      .description(`Process Expo cloud builds (required for ${EXPO_CLOUD_BUILDS_COMMAND})`)
      .option(
        `--${PROFILE_OPTION} <profile>`,
        `EAS build profile (must match profile used in ${EXPO_CLOUD_BUILDS_COMMAND})`
      )
      .action(async (options) => {
        setReportingContext(EAS_BUILD_ON_COMPLETE_COMMAND, options);
        await easBuildOnComplete(options);
      });

    program
      .command(INIT_COMMAND)
      .description('Initialize Sherlo in your React Native or Expo project')
      .option(...sharedOptions[TOKEN_OPTION])
      .action(async (options) => {
        setReportingContext(INIT_COMMAND, options);
        await init(options);
      });

    if (process.argv.length === 2) {
      console.log('Choose a Sherlo command. Use --help for more information.');
      process.exit(0);
    }

    await program.parseAsync(process.argv);

    await reporting.flush();
  } catch (error) {
    if (error.unexpectedError) {
      reporting.captureException(error.unexpectedError);
    }

    await reporting.flush().finally(() => {
      console.error((error as Error).message);
      process.exit(error.code || 1);
    });
  }
}

export default start;
