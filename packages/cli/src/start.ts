import chalk from 'chalk';
import { Command } from 'commander';
import { version } from '../package.json';
import {
  easBuildOnComplete,
  init,
  test,
  testEasCloudBuild,
  testEasUpdate,
  testStandard,
} from './commands';
import {
  ANDROID_FILE_TYPES,
  ANDROID_OPTION,
  API_URL_OPTION,
  BRANCH_OPTION,
  CONFIG_OPTION,
  CONTACT_EMAIL,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_PROJECT_ROOT,
  DISCORD_URL,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  INCLUDE_OPTION,
  INIT_COMMAND,
  IOS_FILE_TYPES,
  IOS_OPTION,
  MESSAGE_OPTION,
  PLATFORM_LABEL,
  PROFILE_OPTION,
  PROJECT_ROOT_OPTION,
  TEST_COMMAND,
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TEST_EAS_UPDATE_COMMAND,
  TEST_STANDARD_COMMAND,
  TOKEN_OPTION,
  WAIT_FOR_EAS_BUILD_OPTION,
} from './constants';
import { logWarning, reporting, withCommandTimeout } from './helpers';

// Disable all Node.js warnings
process.removeAllListeners('warning');

async function start() {
  try {
    reporting.init();

    const program = new Command();

    program
      .name('sherlo')
      .version(version, '--version', 'Output the version number')
      .description('Sherlo CLI for React Native Storybook visual testing');

    addInitCommand(program);

    addTestCommand(program);

    addTestStandardCommand(program);

    addTestEasUpdateCommand(program);

    addTestEasCloudBuildCommand(program);

    if (process.argv.length === 2) {
      console.log('Choose a Sherlo command. Use --help for more information.');
      process.exit(0);
    }

    await program.parseAsync(process.argv);

    await reporting.flush();
  } catch (error) {
    if (!error.skipReporting) {
      reporting.captureException(error);
    }

    await reporting.flush().finally(() => {
      console.error((error as Error).message);

      console.log(chalk.dim('═'.repeat(10) + '\n'));
      console.log(chalk.dim('Need Help?'));
      console.log(chalk.dim('➜ ') + chalk.dim(DISCORD_URL));
      console.log(chalk.dim('➜ ') + chalk.dim(CONTACT_EMAIL));

      process.exit(error.code || 1);
    });
  }
}

export default start;

/* ========================================================================== */

const COMMAND_DESCRIPTION = {
  [INIT_COMMAND]: 'Initialize Sherlo',
  [TEST_COMMAND]: 'Run test interactively',
  [TEST_STANDARD_COMMAND]: 'Test standard builds',
  [TEST_EAS_UPDATE_COMMAND]: 'Test builds with dynamic JavaScript (OTA) updates',
  [TEST_EAS_CLOUD_BUILD_COMMAND]: 'Test cloud builds created on Expo servers',
  [EAS_BUILD_ON_COMPLETE_COMMAND]: `Process EAS Build (required for \`${TEST_EAS_CLOUD_BUILD_COMMAND}\`)`,
};

const OPTION_DEFINITION: Record<string, [string, string]> = {
  [ANDROID_OPTION]: [
    `--${ANDROID_OPTION} <path>`,
    `Path to ${PLATFORM_LABEL.android} build (${ANDROID_FILE_TYPES.join(', ')})`,
  ],
  [API_URL_OPTION]: [
    `--${API_URL_OPTION} <url>`,
    'Custom API endpoint URL (for local development)',
  ],
  [BRANCH_OPTION]: [
    `--${BRANCH_OPTION} <branch>`,
    'Name of the EAS Update branch to fetch the latest update from',
  ],
  [CONFIG_OPTION]: [
    `--${CONFIG_OPTION} <path>`,
    `Path to the config file (default: ${DEFAULT_CONFIG_FILENAME})`,
  ],
  [EAS_BUILD_SCRIPT_NAME_OPTION]: [
    `--${EAS_BUILD_SCRIPT_NAME_OPTION} <name>`,
    'Name of the package.json script that triggers EAS Build',
  ],
  [INCLUDE_OPTION]: [
    `--${INCLUDE_OPTION} <stories>`,
    'List of story names to include in the test (e.g. "My Story","Another Story")',
  ],
  [IOS_OPTION]: [
    `--${IOS_OPTION} <path>`,
    `Path to ${PLATFORM_LABEL.ios} build (${IOS_FILE_TYPES.join(', ')})`,
  ],
  [MESSAGE_OPTION]: [`--${MESSAGE_OPTION} <message>`, 'Custom message to label the test'],
  [PROFILE_OPTION]: [
    `--${PROFILE_OPTION} <profile>`,
    `EAS Build profile (must match profile used in \`${TEST_EAS_CLOUD_BUILD_COMMAND}\`)`,
  ],
  [PROJECT_ROOT_OPTION]: [
    `--${PROJECT_ROOT_OPTION} <path>`,
    `Path to the root directory of your project (default: ${DEFAULT_PROJECT_ROOT})`,
  ],
  [TOKEN_OPTION]: [`--${TOKEN_OPTION} <token>`, 'Authentication token for the project'],
  [WAIT_FOR_EAS_BUILD_OPTION]: [
    `--${WAIT_FOR_EAS_BUILD_OPTION}`,
    'Start waiting for EAS Build to be triggered manually',
  ],
};

function addInitCommand(program: Command) {
  addCommand({
    program,
    command: INIT_COMMAND,
    options: [TOKEN_OPTION],
    action: init,
    withTimeout: false,
  });
}

function addTestCommand(program: Command) {
  addCommand({
    program,
    command: TEST_COMMAND,
    options: getTestCommonOptions('withPlatformPaths'),
    action: test,
  });
}

function addTestStandardCommand(program: Command) {
  addCommand({
    program,
    command: TEST_STANDARD_COMMAND,
    oldCommand: 'local-builds',
    options: getTestCommonOptions('withPlatformPaths'),
    action: testStandard,
  });
}

function addTestEasUpdateCommand(program: Command) {
  addCommand({
    program,
    command: TEST_EAS_UPDATE_COMMAND,
    oldCommand: 'expo-update',
    options: [BRANCH_OPTION, ...getTestCommonOptions('withPlatformPaths')],
    action: testEasUpdate,
  });
}

function addTestEasCloudBuildCommand(program: Command) {
  addCommand({
    program,
    command: TEST_EAS_CLOUD_BUILD_COMMAND,
    oldCommand: 'expo-cloud-builds',
    options: [
      EAS_BUILD_SCRIPT_NAME_OPTION,
      WAIT_FOR_EAS_BUILD_OPTION,
      ...getTestCommonOptions('withoutPlatformPaths'),
    ],
    action: testEasCloudBuild,
  });

  addCommand({
    program,
    command: EAS_BUILD_ON_COMPLETE_COMMAND,
    options: [PROFILE_OPTION],
    action: easBuildOnComplete,
  });
}

function addCommand({
  program,
  command,
  oldCommand,
  options,
  action: handler,
  withTimeout = true,
}: {
  program: Command;
  command: keyof typeof COMMAND_DESCRIPTION;
  oldCommand?: string;
  options: (keyof typeof OPTION_DEFINITION)[];
  action: (options: any) => Promise<any>;
  withTimeout?: boolean;
}) {
  const action = async (actionOptions: any, commandInstance: Command) => {
    if (oldCommand && commandInstance.name() === oldCommand) {
      showDeprecationWarning({ oldCommand, newCommand: command });
    }

    setReportingContext(command, actionOptions);

    if (withTimeout) {
      await withCommandTimeout(handler)(actionOptions);
    } else {
      await handler(actionOptions);
    }
  };

  if (oldCommand) {
    const deprecatedCommand = program.command(oldCommand, { hidden: true });
    addOptionsToCommand(deprecatedCommand, options);
    deprecatedCommand.action(action);
  }

  const commandInstance = program.command(command).description(COMMAND_DESCRIPTION[command]);
  addOptionsToCommand(commandInstance, options);
  commandInstance.action(action);
}

function showDeprecationWarning({
  oldCommand,
  newCommand,
}: {
  oldCommand: string;
  newCommand: string;
}) {
  console.log();
  logWarning({
    message: `"${oldCommand}" command is deprecated and will be removed in a future version`,
  });
  console.warn(chalk.yellow(`  Please use "${newCommand}" instead`));
  console.log();

  process.env.SKIP_INTRO = 'true';
}

function setReportingContext(command: string, options: any) {
  const optionsWithHiddenToken = options[TOKEN_OPTION]
    ? { ...options, [TOKEN_OPTION]: '[hidden]' }
    : options;

  reporting.setContext('Command', { command, commandOptions: optionsWithHiddenToken });
}

function addOptionsToCommand(command: Command, optionKeys: (keyof typeof OPTION_DEFINITION)[]) {
  optionKeys.forEach((optionKey) => {
    command.option(...OPTION_DEFINITION[optionKey]);
  });
}

function getTestCommonOptions(variant: 'withPlatformPaths' | 'withoutPlatformPaths') {
  return [
    ...(variant === 'withPlatformPaths' ? [ANDROID_OPTION] : []),
    ...(variant === 'withPlatformPaths' ? [IOS_OPTION] : []),
    TOKEN_OPTION,
    MESSAGE_OPTION,
    INCLUDE_OPTION,
    CONFIG_OPTION,
    PROJECT_ROOT_OPTION,
    API_URL_OPTION,
  ];
}
