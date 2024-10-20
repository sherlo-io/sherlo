import { Command } from 'commander';
import { version } from '../package.json';
import { localBuilds, expoRemoteBuilds, easBuildOnComplete, expoUpdate } from './commands';
import { printHeader } from './helpers';

async function start() {
  try {
    const program = new Command();

    program
      .name('sherlo')
      .version(version, '--version', 'Output the version number')
      .description('Sherlo CLI for automating visual testing of React Native Storybook');

    program
      .command('local-builds')
      .description('Run Sherlo with local builds')
      .option('--android <path>', 'Path to the Android build in .apk format')
      .option('--ios <path>', 'Path to the iOS build in .app (or compressed .tar.gz / .tar) format')
      .option('--token <token>', 'Project token')
      .option('--config <path>', 'Config file path')
      .option('--projectRoot <path>', 'Root of the React Native project')
      .action(async (options) => {
        await localBuilds(options);
      });

    program
      .command('expo-update')
      .description('Run Sherlo with Expo update')
      .option('--androidUrl <url>', 'URL for the Android Expo update')
      .option('--iosUrl <url>', 'URL for the iOS Expo update')
      .option('--android <path>', 'Path to the Android build in .apk format')
      .option('--ios <path>', 'Path to the iOS build in .app (or compressed .tar.gz / .tar) format')
      .option('--token <token>', 'Project token')
      .option('--config <path>', 'Config file path')
      .option('--projectRoot <path>', 'Root of the React Native project')
      .action(async (options) => {
        await expoUpdate(options);
      });

    program
      .command('expo-remote-builds')
      .description('Run Sherlo with Expo remote builds')
      .option('--buildScript <script>', 'Name of the build script in package.json')
      .option('--manual', 'Run in manual mode, waiting for you to build the app on Expo servers')
      .option('--token <token>', 'Project token')
      .option('--config <path>', 'Config file path')
      .option('--projectRoot <path>', 'Root of the React Native project')
      .action(expoRemoteBuilds);

    program
      .command('eas-build-on-complete')
      .description('Process Sherlo EAS builds after completion (required for remote Expo builds)')
      .option('--profile <profile>', 'EAS build profile to use')
      .action(easBuildOnComplete);

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
