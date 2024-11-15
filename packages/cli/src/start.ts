import { Command } from 'commander';
import { version } from '../package.json';
import { localBuilds, expoCloudBuilds, easBuildOnComplete, expoUpdate } from './commands';
import {
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATES_COMMAND,
  LOCAL_BUILDS_COMMAND,
  PLATFORM_LABEL,
  WAIT_FOR_EAS_BUILD_OPTION,
} from './constants';
import { printHeader } from './helpers';
async function start() {
  try {
    const program = new Command();

    const sharedOptions = {
      android: ['--android <path>', `Path to the ${PLATFORM_LABEL.android} build in .apk format`],
      ios: [
        '--ios <path>',
        `Path to the ${PLATFORM_LABEL.ios} build in .app (or compressed .tar.gz / .tar) format`,
      ],
      token: ['--token <token>', 'Authentication token for the project'],
      config: ['--config <path>', 'Path to the config file'],
      projectRoot: ['--projectRoot <path>', 'Root directory of the React Native project'],
    } as const;

    program
      .name('sherlo')
      .version(version, '--version', 'Output the version number')
      .description('Sherlo CLI for automating visual testing of React Native Storybook');

    program
      .command(LOCAL_BUILDS_COMMAND)
      .description('Run Sherlo with locally available builds')
      .option(...sharedOptions.android)
      .option(...sharedOptions.ios)
      .option(...sharedOptions.token)
      .option(...sharedOptions.config)
      .option(...sharedOptions.projectRoot)
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
      .option(...sharedOptions.token)
      .option(...sharedOptions.config)
      .option(...sharedOptions.projectRoot)
      .action(async (options) => {
        await expoCloudBuilds(options);
      });

    program
      .command(EAS_BUILD_ON_COMPLETE_COMMAND)
      .description(
        `Process completion of Expo cloud builds; required for \`sherlo ${EXPO_CLOUD_BUILDS_COMMAND}\``
      )
      .option(
        '--profile <profile_name>',
        `EAS build profile matching the one used in \`sherlo ${EXPO_CLOUD_BUILDS_COMMAND}\`` // TODO: EAS build profile used with the `eas build` command
      )
      .action(easBuildOnComplete);

    program
      .command(EXPO_UPDATES_COMMAND)
      .description('Run Sherlo with Expo updates')
      .option(
        '--channel <channel_name>',
        'Name of the Expo update channel to retrieve the latest update'
      )
      .option('--json <json_output>', 'JSON output from the `eas update --json` command') // TODO: --easUpdateJsonOutput ?
      // TODO: pozbyc sie tych opcji
      .option('--androidUpdateUrl <url>', `URL for the ${PLATFORM_LABEL.android} Expo update`)
      .option('--iosUpdateUrl <url>', `URL for the ${PLATFORM_LABEL.ios} Expo update`)
      .option(...sharedOptions.android)
      .option(...sharedOptions.ios)
      .option(...sharedOptions.token)
      .option(...sharedOptions.config)
      .option(...sharedOptions.projectRoot)
      .action(async (options) => {
        await expoUpdate(options);
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
