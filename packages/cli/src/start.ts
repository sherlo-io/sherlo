import { Command } from 'commander';
import { version } from '../package.json';
import { localBuilds, expoCloud, easBuildOnComplete, expoUpdate } from './commands';
import { printHeader } from './helpers';

async function start() {
  try {
    const program = new Command();

    const sharedOptions = {
      android: ['--android <path>', 'Path to the Android build in .apk format'],
      ios: ['--ios <path>', 'Path to the iOS build in .app (or compressed .tar.gz / .tar) format'],
      token: ['--token <token>', 'Project token'],
      config: ['--config <path>', 'Config file path'],
      projectRoot: ['--projectRoot <path>', 'Root of the React Native project'],
    } as const;

    program
      .name('sherlo')
      .version(version, '--version', 'Output the version number')
      .description('Sherlo CLI for automating visual testing of React Native Storybook');

    program
      .command('local-builds')
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
      .command('expo-update')
      .description('Run Sherlo with Expo update')
      .option('--androidUpdateUrl <url>', 'URL for the Android Expo update')
      .option('--iosUpdateUrl <url>', 'URL for the iOS Expo update')
      .option(...sharedOptions.android)
      .option(...sharedOptions.ios)
      .option(...sharedOptions.token)
      .option(...sharedOptions.config)
      .option(...sharedOptions.projectRoot)
      .action(async (options) => {
        await expoUpdate(options);
      });

    program
      .command('expo-cloud')
      .description('Run Sherlo with Expo cloud builds')
      .option('--buildScript <script>', 'Name of the EAS build script in package.json') // TODO: --scriptName / --easBuildScriptName
      .option('--manual', 'Run in manual mode, waiting for you to build the app on Expo servers') // TODO: --waiting / --waitForBuild
      .option(...sharedOptions.token)
      .option(...sharedOptions.config)
      .option(...sharedOptions.projectRoot)
      .action(async (options) => {
        await expoCloud(options);
      });

    program
      .command('eas-build-on-complete')
      .description('Process Sherlo EAS builds after completion (required for expo-cloud)')
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
